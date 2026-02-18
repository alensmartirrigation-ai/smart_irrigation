const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const { 
  queryLatest, 
  queryMean, 
  computeTrend, 
  computeTrendAdvanced, 
  queryExtremes, 
  queryHistory, 
  buildRange, 
  sanitizeId 
} = require('./farmService');
const { getActiveAlerts } = require('./alertService');
const { getIrrigationHistory } = require('./irrigationService');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_ITERATIONS = 5;
const DEFAULT_FARM = process.env.DEFAULT_FARM_ID || 'farm-01';

// ─── Tool Definitions (OpenAI function-calling schema) ───────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_latest_readings',
      description:
        'Get the most recent sensor readings for a farm. Returns latest temperature, humidity, and soil_moisture values with timestamps.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: {
            type: 'string',
            description: 'Farm identifier, e.g. "farm-01". Defaults to the user\'s default farm if not specified.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sensor_averages',
      description:
        'Get the average value of a sensor field over a time period for a farm.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
          field: {
            type: 'string',
            enum: ['temperature', 'humidity', 'soil_moisture'],
            description: 'The sensor field to average',
          },
          period: {
            type: 'string',
            description: 'Time period in InfluxDB duration format, e.g. "-6h", "-24h", "-7d"',
            default: '-24h',
          },
        },
        required: ['field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sensor_trends',
      description:
        'Get the trend direction (increasing, decreasing, or stable) for a sensor field over a period.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
          field: {
            type: 'string',
            enum: ['temperature', 'humidity', 'soil_moisture'],
            description: 'The sensor field to check trend for',
          },
          period: {
            type: 'string',
            description: 'The window size for comparison, e.g. "6h", "24h", "7d". It compares this period vs the prior period of the same length.',
            default: '6h',
          },
        },
        required: ['field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sensor_extremes',
      description: 'Find the minimum or maximum value for a sensor field over a period.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
          field: {
            type: 'string',
            enum: ['temperature', 'humidity', 'soil_moisture'],
            description: 'The sensor field',
          },
          type: {
            type: 'string',
            enum: ['min', 'max'],
            description: 'Whether to find the minimum or maximum value',
            default: 'max',
          },
          period: {
            type: 'string',
            description: 'Time period, e.g. "-24h", "-7d"',
            default: '-24h',
          },
        },
        required: ['field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sensor_history',
      description: 'Get raw sensor readings over a period. Useful for listing multiple recent points.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
          field: {
            type: 'string',
            enum: ['temperature', 'humidity', 'soil_moisture'],
            description: 'The sensor field',
          },
          period: {
            type: 'string',
            description: 'Time period, e.g. "-6h", "-24h"',
            default: '-6h',
          },
          limit: {
            type: 'number',
            description: 'Number of points to return',
            default: 10,
          },
        },
        required: ['field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_last_irrigation',
      description: 'Find exactly when the farm was last watered and for how long.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_alerts',
      description:
        'Get all currently active threshold alerts for a farm. Alerts include soil moisture low, temperature high, humidity issues.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_irrigation_history',
      description:
        'Get the recent irrigation (watering) history for a farm. Shows the date/time and duration of each watering event.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm identifier' },
          limit: {
            type: 'number',
            description: 'Number of recent events to retrieve',
            default: 5,
          },
        },
        required: [],
      },
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────────────────────────

const executeTool = async (name, args) => {
  const farmId = sanitizeId(args.farm_id || DEFAULT_FARM);

  switch (name) {
    case 'get_latest_readings': {
      const fields = ['temperature', 'humidity', 'soil_moisture'];
      const results = {};
      for (const field of fields) {
        results[field] = await queryLatest(farmId, field);
      }
      return { farm_id: farmId, readings: results };
    }

    case 'get_sensor_averages': {
      const period = args.period || '-24h';
      const rangeClause = buildRange(period);
      const avg = await queryMean(farmId, args.field, rangeClause);
      return { farm_id: farmId, field: args.field, period, average: avg };
    }

    case 'get_sensor_trends': {
      const period = args.period || '6h';
      const trend = await computeTrendAdvanced(farmId, args.field, period);
      return { farm_id: farmId, field: args.field, period, trend };
    }

    case 'get_sensor_extremes': {
      const type = args.type || 'max';
      const period = args.period || '-24h';
      const result = await queryExtremes(farmId, args.field, buildRange(period), type);
      return { farm_id: farmId, field: args.field, type, period, result };
    }

    case 'get_sensor_history': {
      const period = args.period || '-6h';
      const limit = args.limit || 10;
      const history = await queryHistory(farmId, args.field, buildRange(period), limit);
      return { farm_id: farmId, field: args.field, period, history };
    }

    case 'get_active_alerts': {
      const alerts = await getActiveAlerts(farmId);
      return { farm_id: farmId, alert_count: alerts.length, alerts };
    }

    case 'get_irrigation_history': {
      const limit = args.limit || 5;
      const history = await getIrrigationHistory(farmId, limit);
      return { farm_id: farmId, irrigation_history: history };
    }

    case 'get_last_irrigation': {
      const history = await getIrrigationHistory(farmId, 1);
      return { farm_id: farmId, last_event: history[0] || null };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
};

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a smart irrigation assistant for farmers. You have access to real-time farm sensor data through tools.

WHATSAPP FORMATTING RULES:
- **Bold**: Use single asterisks (*text*). Use for labels, headings, and critical values.
- **Italic**: Use single underscores (_text_). Use for secondary info or timestamps.
- **Strict Syntax**: NO spaces between the symbol and the text (e.g., use *Bold*, NOT * Bold *).
- **Signal Hierarchy**: Use formatting to create a clear visual structure.
  Example patterns:
  *STATUS:* Farm summary
  _Info:_ Sensor updated 5m ago
  *ALERT:* Soil moisture low
- **Emojis**: Use sparingly to enhance (e.g. 🌱, 💧, 🚨).
- **Conciseness**: Keep replies under 250 words. Use simple language.

OPERATIONAL RULES:
- When a user asks about farm conditions or data — USE YOUR TOOLS to fetch real data.
- The default farm is "${DEFAULT_FARM}".
- Call multiple tools in one turn if needed to answer the user's query comprehensively.`;

// ─── Agent Loop ──────────────────────────────────────────────────────────────

const runAgent = async (userMessage) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];

      // If the model wants to call tools
      if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls) {
        messages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments);

          logger.info('Agent tool call', { tool: fnName, args: fnArgs, iteration: i + 1 });
          console.log(`\n🔧 Agent calling tool: ${fnName}`, fnArgs);

          let result;
          try {
            result = await executeTool(fnName, fnArgs);
          } catch (err) {
            logger.error('Tool execution failed', { tool: fnName, error: err.message });
            result = { error: `Failed to execute ${fnName}: ${err.message}` };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        continue; // Loop back to get the model's next response
      }

      // Model gave a final text response
      let reply = choice.message.content?.trim();
      
      if (reply) {
        // WhatsApp use solid single asterisks for bold (*text*)
        // Standard Markdown uses double (**text**). We convert double to single
        // and ensure we don't end up with triple stars.
        reply = reply.replace(/\*\*\*/g, '*');
        reply = reply.replace(/\*\*/g, '*');
      }

      logger.info('Agent completed', { iterations: i + 1 });
      return reply || 'Sorry, I could not process your request.';
    }

    // If we hit max iterations
    logger.warn('Agent hit max iterations', { max: MAX_ITERATIONS });
    return 'I gathered some data but couldn\'t form a complete answer. Please try a simpler question.';
  } catch (error) {
    logger.error('Agent failed', { error: error.message });
    return 'Sorry, I\'m having trouble connecting right now. Please try again shortly.';
  }
};

module.exports = { runAgent };
