const OpenAI = require('openai');
const { z } = require('zod');
const env = require('../config/env');
const logger = require('../utils/logger');
const { influxQueryApi, influxBucket } = require('../config/influxClient');
const { sanitizeId } = require('./farmService');

const ALLOWED_METRICS = ['temperature', 'humidity', 'soil_moisture'];
const ALLOWED_AGGREGATIONS = ['mean', 'min', 'max', 'sum', 'count', 'last'];
const MAX_LOOKBACK_DAYS = 30;
const MAX_POINTS_FOR_CONTEXT = 60;
const MAX_CONTEXT_TURNS = 6;
const DEFAULT_FARM_ID = env.DEFAULT_FARM_ID || 'farm-01';

const intentSchema = z.object({
  type: z.enum(['data_query', 'general_chat']),
  farm_id: z.string().trim().min(1).optional(),
  metric: z.enum(ALLOWED_METRICS).optional(),
  aggregation: z.enum(ALLOWED_AGGREGATIONS).optional(),
  time_range: z.string().trim().min(1).optional(),
});

const startOfUtcDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const toIso = (date) => date.toISOString();

const buildWindowFromDays = (days) => {
  const now = new Date();
  const capped = Math.min(Math.max(days, 1), MAX_LOOKBACK_DAYS);
  const start = new Date(now.getTime() - capped * 24 * 60 * 60 * 1000);
  return {
    label: `last_${capped}_days`,
    days: capped,
    start,
    stop: now,
  };
};

const normalizeTimeRange = (input) => {
  const raw = String(input || '').trim().toLowerCase();

  if (raw === 'yesterday') {
    const todayStart = startOfUtcDay(new Date());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    return {
      label: 'yesterday',
      days: 1,
      start: yesterdayStart,
      stop: todayStart,
    };
  }

  if (raw === 'today') {
    const todayStart = startOfUtcDay(new Date());
    return {
      label: 'today',
      days: 1,
      start: todayStart,
      stop: new Date(),
    };
  }

  if (raw === 'last_24_hours' || raw === 'past_24_hours' || raw === 'last 24 hours') {
    return buildWindowFromDays(1);
  }

  if (raw === 'last_7_days' || raw === 'last 7 days') {
    return buildWindowFromDays(7);
  }

  if (raw === 'last_30_days' || raw === 'last 30 days') {
    return buildWindowFromDays(30);
  }

  const explicitDayMatch = raw.match(/(?:last|past)?\s*(\d{1,3})\s*d(?:ays?)?$/);
  if (explicitDayMatch) {
    const parsedDays = Number.parseInt(explicitDayMatch[1], 10);
    return buildWindowFromDays(parsedDays);
  }

  return buildWindowFromDays(1);
};

const buildFluxQuery = ({ farmId, metric, aggregation, timeWindow }) => {
  const normalizedFarmId = sanitizeId(farmId);

  if (!ALLOWED_METRICS.includes(metric)) {
    throw new Error(`Unsupported metric: ${metric}`);
  }
  if (!ALLOWED_AGGREGATIONS.includes(aggregation)) {
    throw new Error(`Unsupported aggregation: ${aggregation}`);
  }

  const startIso = toIso(timeWindow.start);
  const stopIso = toIso(timeWindow.stop);

  const base = `
from(bucket: "${influxBucket}")
  |> range(start: time(v: "${startIso}"), stop: time(v: "${stopIso}"))
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings")
  |> filter(fn: (r) => r["farm_id"] == "${normalizedFarmId}")
  |> filter(fn: (r) => r["_field"] == "${metric}")
`;

  const aggregatePart = aggregation === 'last' ? '|> last()' : `|> ${aggregation}()`;
  return `${base}  ${aggregatePart}`;
};

const summarizeRows = (rows, aggregation) => {
  const dataPoints = rows
    .map((row) => ({
      timestamp: row._time,
      value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    }))
    .filter((point) => typeof point.value === 'number')
    .slice(0, MAX_POINTS_FOR_CONTEXT);

  if (dataPoints.length === 0) {
    return {
      data_points: [],
      summary: {
        aggregation_result: null,
        mean: null,
        min: null,
        max: null,
        count: 0,
      },
    };
  }

  const values = dataPoints.map((point) => point.value);
  const total = values.reduce((acc, value) => acc + value, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = total / values.length;

  const aggregationResult =
    aggregation === 'min'
      ? min
      : aggregation === 'max'
        ? max
        : aggregation === 'sum'
          ? total
          : aggregation === 'count'
            ? values.length
            : values[values.length - 1];

  return {
    data_points: dataPoints,
    summary: {
      aggregation_result: Number(aggregationResult.toFixed ? aggregationResult.toFixed(2) : aggregationResult),
      mean: Number(mean.toFixed(2)),
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      count: values.length,
    },
  };
};

class AIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY is not set. AI features will be disabled.');
      this.openai = null;
      return;
    }

    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.conversationMemory = new Map();
  }

  getConversationKey(conversationId) {
    if (!conversationId || typeof conversationId !== 'string') {
      return 'default';
    }
    return conversationId.slice(0, 120);
  }

  getConversationHistory(conversationId) {
    const key = this.getConversationKey(conversationId);
    const existing = this.conversationMemory.get(key);
    return Array.isArray(existing) ? existing : [];
  }

  saveConversationTurn(conversationId, question, answer) {
    const key = this.getConversationKey(conversationId);
    const history = this.getConversationHistory(key);
    history.push({
      question,
      answer,
      timestamp: new Date().toISOString(),
    });
    this.conversationMemory.set(key, history.slice(-MAX_CONTEXT_TURNS));
  }

  historyToMessages(conversationId) {
    const history = this.getConversationHistory(conversationId);
    const messages = [];

    for (const turn of history) {
      if (turn.question) {
        messages.push({ role: 'user', content: turn.question });
      }
      if (turn.answer) {
        messages.push({ role: 'assistant', content: turn.answer });
      }
    }

    return messages;
  }

  async extractIntent(question, farmIdOverride, conversationId) {
    const historyMessages = this.historyToMessages(conversationId);
    const completion = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Categorize user query into "data_query" or "general_chat". ' +
            'If it is "data_query" (about sensor readings like temp, humidity, soil), provide: farm_id, metric, aggregation, time_range. ' +
            `metric must be one of: ${ALLOWED_METRICS.join(', ')}. ` +
            `aggregation must be one of: ${ALLOWED_AGGREGATIONS.join(', ')}. ` +
            'time_range should be a concise phrase like yesterday, today, last 7 days. ' +
            'If "general_chat", set type to "general_chat" and omit other fields except optionally farm_id. ' +
            'Return valid JSON only.',
        },
        ...historyMessages,
        {
          role: 'user',
          content: question,
        },
      ],
      max_tokens: 180,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error('Intent extraction produced invalid JSON');
    }

    const candidate = {
      ...parsed,
      farm_id: farmIdOverride || parsed.farm_id || DEFAULT_FARM_ID,
    };

    const validated = intentSchema.safeParse(candidate);
    if (!validated.success) {
      throw new Error('Intent schema validation failed');
    }

    return {
      ...validated.data,
      farm_id: sanitizeId(validated.data.farm_id),
    };
  }

  async generateGroundedAnswer({ question, intent, queryResult, timeWindow, conversationId }) {
    const groundingPayload = {
      user_question: question,
      intent,
      time_range: {
        label: timeWindow.label,
        start: toIso(timeWindow.start),
        stop: toIso(timeWindow.stop),
      },
      result: queryResult,
    };

    const historyMessages = this.historyToMessages(conversationId);
    const completion = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Answer strictly from DATABASE_RESULT JSON. Do not speculate. ' +
            'If data is missing or empty, clearly state data is insufficient.',
        },
        ...historyMessages,
        {
          role: 'user',
          content: `QUESTION: ${question}\nDATABASE_RESULT: ${JSON.stringify(groundingPayload)}`,
        },
      ],
      max_tokens: 250,
    });

    return completion.choices[0]?.message?.content?.trim() || 'No answer could be generated.';
  }

  async answerInfluxQuestion(question, options = {}) {
    if (!this.openai) {
      return {
        answer:
          "I'm sorry, but AI features are currently disabled. Please contact the administrator.",
        grounded: false,
      };
    }

    const conversationId = options.conversationId || options.farmId || DEFAULT_FARM_ID;
    const intent = await this.extractIntent(question, options.farmId, conversationId);

    if (intent.type === 'general_chat') {
      throw new Error('GENERAL_CHAT_INTENT');
    }

    const timeWindow = normalizeTimeRange(intent.time_range);

    if (timeWindow.days > MAX_LOOKBACK_DAYS) {
      throw new Error(`Time range exceeds maximum of ${MAX_LOOKBACK_DAYS} days`);
    }

    const fluxQuery = buildFluxQuery({
      farmId: intent.farm_id,
      metric: intent.metric,
      aggregation: intent.aggregation,
      timeWindow,
    });

    logger.info('AI generated Flux query', {
      farm_id: intent.farm_id,
      metric: intent.metric,
      aggregation: intent.aggregation,
      time_range: intent.time_range,
      flux_query: fluxQuery,
    });

    const rows = await influxQueryApi.collectRows(fluxQuery);
    const queryResult = summarizeRows(rows, intent.aggregation);

    const answer = await this.generateGroundedAnswer({
      question,
      intent,
      queryResult,
      timeWindow,
      conversationId,
    });

    this.saveConversationTurn(conversationId, question, answer);

    return {
      answer,
      grounded: true,
      intent,
      query: {
        flux: fluxQuery,
        time_range: {
          label: timeWindow.label,
          start: toIso(timeWindow.start),
          stop: toIso(timeWindow.stop),
        },
      },
      result: queryResult,
    };
  }

  async generateResponse(userMessage, context = [], options = {}) {
    if (!this.openai) {
      return "I'm sorry, but AI features are currently disabled. Please contact the administrator.";
    }

    try {
      const queryAnswer = await this.answerInfluxQuestion(userMessage, {
        conversationId: options.conversationId,
      });
      return queryAnswer.answer;
    } catch (error) {
      logger.warn('Influx query pipeline fallback to general chat', { error: error.message });

      const conversationId = options.conversationId || 'default';
      const historyMessages = this.historyToMessages(conversationId);
      const completion = await this.openai.chat.completions.create({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'You are a smart-irrigation system assistant. ' +
              'If the user is saying hello or simple greeting, respond naturally but keep it brief. ' +
              'If the user asks a personal query or anything unrelated to farm/irrigation data, ' +
              'strictly respond with the exact phrase: "not in context".',
          },
          ...historyMessages,
          ...context,
          { role: 'user', content: userMessage },
        ],
      });

      const answer =
        completion.choices[0]?.message?.content?.trim() ||
        "I couldn't process that request. Please rephrase with farm, metric, and time range.";

      this.saveConversationTurn(conversationId, userMessage, answer);
      return answer;
    }
  }
}

module.exports = new AIService();
