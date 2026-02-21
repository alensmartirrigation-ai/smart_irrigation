const OpenAI = require("openai");
const { z } = require("zod");
const env = require("../config/env");
const logger = require("../utils/logger");
const { influxQueryApi, influxBucket } = require("../config/influxClient");
const { sanitizeId } = require("./farmService");

const ALLOWED_METRICS = ["temperature", "humidity", "soil_moisture"];
const ALLOWED_AGGREGATIONS = ["mean", "min", "max", "sum", "count", "last"];
const MAX_LOOKBACK_DAYS = 30;
const DEFAULT_FARM_ID = env.DEFAULT_FARM_ID || "farm-01";

class AIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      logger.warn("OPENAI_API_KEY not set");
      this.openai = null;
      return;
    }

    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  normalizeTimeRange(input) {
    const raw = String(input || "").toLowerCase();

    const now = new Date();
    const daysMatch = raw.match(/(\d+)\s*d/);
    const days = daysMatch ? Math.min(parseInt(daysMatch[1]), MAX_LOOKBACK_DAYS) : 1;

    const start = new Date(now.getTime() - days * 86400000);
    return { start, stop: now };
  }

  buildFluxQuery({ farmId, metric, aggregation, start, stop }) {
    const normalizedFarmId = sanitizeId(farmId);

    return `
from(bucket: "${influxBucket}")
  |> range(start: time(v: "${start.toISOString()}"), stop: time(v: "${stop.toISOString()}"))
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings")
  |> filter(fn: (r) => r["farm_id"] == "${normalizedFarmId}")
  |> filter(fn: (r) => r["_field"] == "${metric}")
  |> ${aggregation}()
`;
  }

  async queryInfluxData({ farm_id, metric, aggregation, time_range }) {
    if (!ALLOWED_METRICS.includes(metric))
      throw new Error("Invalid metric");

    if (!ALLOWED_AGGREGATIONS.includes(aggregation))
      throw new Error("Invalid aggregation");

    const { start, stop } = this.normalizeTimeRange(time_range);

    const flux = this.buildFluxQuery({
      farmId: farm_id || DEFAULT_FARM_ID,
      metric,
      aggregation,
      start,
      stop
    });

    const rows = await influxQueryApi.collectRows(flux);

    return {
      metric,
      aggregation,
      farm_id,
      start,
      stop,
      rows
    };
  }

  async generateResponse(userMessage) {
    if (!this.openai)
      return "AI disabled.";

    const response = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a smart irrigation assistant. " +
            "When users request farm data, call the tool. " +
            "For unrelated queries respond: not in context."
        },
        { role: "user", content: userMessage }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "query_influx_data",
            description: "Fetch farm sensor data",
            parameters: {
              type: "object",
              properties: {
                farm_id: { type: "string" },
                metric: {
                  type: "string",
                  enum: ALLOWED_METRICS
                },
                aggregation: {
                  type: "string",
                  enum: ALLOWED_AGGREGATIONS
                },
                time_range: { type: "string" }
              },
              required: ["metric", "aggregation", "time_range"]
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    const message = response.choices[0].message;

    if (message.tool_calls) {
      const toolCall = message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      const toolResult = await this.queryInfluxData(args);

      const finalResponse = await this.openai.chat.completions.create({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Answer strictly from tool data." },
          { role: "user", content: userMessage },
          message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          }
        ]
      });

      return finalResponse.choices[0].message.content;
    }

    return message.content;
  }
}

module.exports = new AIService();