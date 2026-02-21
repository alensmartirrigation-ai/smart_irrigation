const { influxQueryApi, influxBucket } = require("../config/influxClient");
const { sanitizeId } = require("./farmService");
const env = require("../config/env");

const ALLOWED_METRICS = ["temperature", "humidity", "soil_moisture"];
const ALLOWED_AGGREGATIONS = ["mean", "min", "max", "sum", "count", "last"];
const MAX_LOOKBACK_DAYS = 30;
const DEFAULT_FARM_ID = env.DEFAULT_FARM_ID || "farm-01";

function normalizeTimeRange(input) {
  const raw = String(input || "").toLowerCase();
  const now = new Date();
  const daysMatch = raw.match(/(\d+)\s*d/);
  const days = daysMatch ? Math.min(parseInt(daysMatch[1]), MAX_LOOKBACK_DAYS) : 1;
  const start = new Date(now.getTime() - days * 86400000);
  return { start, stop: now };
}

function buildFluxQuery({ farmId, metric, aggregation, start, stop }) {
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

async function queryInfluxData(args) {
  const { farm_id, metric, aggregation, time_range } = args;

  if (!ALLOWED_METRICS.includes(metric)) {
    throw new Error("Invalid metric");
  }

  if (!ALLOWED_AGGREGATIONS.includes(aggregation)) {
    throw new Error("Invalid aggregation");
  }

  const { start, stop } = normalizeTimeRange(time_range);

  const flux = buildFluxQuery({
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
    farm_id: farm_id || DEFAULT_FARM_ID,
    start,
    stop,
    rows
  };
}

const tools = [
  {
    definition: {
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
    },
    handler: queryInfluxData
  }
];

module.exports = {
  tools,
  ALLOWED_METRICS,
  ALLOWED_AGGREGATIONS
};
