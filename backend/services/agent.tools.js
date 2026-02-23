const { influxQueryApi, influxBucket } = require("../config/influxClient");
const { sanitizeId } = require("./farmService");
const { startIrrigation, stopIrrigation } = require("./device.service");
const { Farm, Device, FarmDevice, DeviceReading, DeviceIrrigationStatus, DeviceCommand } = require("../models");
const env = require("../config/env");
const logger = require("../utils/logger");

const ALLOWED_METRICS = ["temperature", "humidity", "soil_moisture"];
const ALLOWED_AGGREGATIONS = ["mean", "min", "max", "sum", "count", "last"];
const MAX_LOOKBACK_DAYS = 30;

// ──────────────── Handler Functions ────────────────

async function handleListFarms() {
  const farms = await Farm.findAll({ attributes: ["id", "name"] });
  return farms.map(f => ({ id: f.id, name: f.name }));
}

async function handleListDevices(args) {
  const { farm_id } = args;
  const farm = await Farm.findByPk(farm_id, {
    include: [{ model: Device, attributes: ["id", "device_name", "location", "moisture_threshold"] }]
  });
  if (!farm) return { error: `Farm ${farm_id} not found` };

  return farm.Devices.map(d => ({
    id: d.id,
    name: d.device_name || "Unnamed",
    location: d.location || "Unknown",
    moisture_threshold: d.moisture_threshold
  }));
}

async function handleGetLatestSensorData(args) {
  const { device_id } = args;
  const device = await Device.findByPk(device_id);
  if (!device) return { error: `Device ${device_id} not found` };

  const latest = await DeviceReading.findOne({
    where: { device_id },
    order: [["recorded_at", "DESC"]]
  });

  if (!latest) return { error: "No readings found for this device" };

  return {
    device_id,
    device_name: device.device_name || "Unnamed",
    temperature: latest.temperature,
    humidity: latest.humidity,
    moisture: latest.moisture,
    recorded_at: latest.recorded_at
  };
}

async function handleStartIrrigation(args) {
  const { device_id, duration_seconds = 60 } = args;
  return await startIrrigation(device_id, duration_seconds);
}

async function handleStopIrrigation(args) {
  const { device_id } = args;
  return await stopIrrigation(device_id);
}

async function handleGetPumpStatus(args) {
  const { device_id } = args;
  const device = await Device.findByPk(device_id);
  if (!device) return { error: `Device ${device_id} not found` };

  // Check irrigation status from summary table
  const status = await DeviceIrrigationStatus.findOne({ where: { device_id } });

  // Check for any pending commands
  const pendingCmd = await DeviceCommand.findOne({
    where: { device_id, status: "PENDING" },
    order: [["createdAt", "DESC"]]
  });

  // Get latest reading to check is_irrigating flag
  const latestReading = await DeviceReading.findOne({
    where: { device_id },
    order: [["recorded_at", "DESC"]]
  });

  return {
    device_id,
    device_name: device.device_name || "Unnamed",
    last_irrigated_at: status?.last_irrigated_at || null,
    last_duration_seconds: status?.last_duration_seconds || null,
    pending_command: pendingCmd ? { command: pendingCmd.command, status: pendingCmd.status } : null,
    currently_irrigating: latestReading?.is_irrigating === 1 || latestReading?.is_irrigating === true || false
  };
}

function normalizeTimeRange(input) {
  const raw = String(input || "").toLowerCase();
  const now = new Date();
  const daysMatch = raw.match(/(\d+)\s*d/);
  const days = daysMatch ? Math.min(parseInt(daysMatch[1]), MAX_LOOKBACK_DAYS) : 1;
  const start = new Date(now.getTime() - days * 86400000);
  return { start, stop: now };
}

function buildFluxQuery({ farmId, deviceId, metric, aggregation, start, stop }) {
  const normalizedFarmId = sanitizeId(farmId);
  let query = `
from(bucket: "${influxBucket}")
  |> range(start: time(v: "${start.toISOString()}"), stop: time(v: "${stop.toISOString()}"))
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings")
  |> filter(fn: (r) => r["farm_id"] == "${normalizedFarmId}")`;

  if (deviceId) {
    query += `\n  |> filter(fn: (r) => r["device_id"] == "${deviceId}")`;
  }

  query += `\n  |> filter(fn: (r) => r["_field"] == "${metric}")
  |> ${aggregation}()`;
  return query;
}

async function handleQueryInfluxData(args) {
  const { farm_id, device_id, metric, aggregation, time_range } = args;

  if (!ALLOWED_METRICS.includes(metric)) return { error: "Invalid metric" };
  if (!ALLOWED_AGGREGATIONS.includes(aggregation)) return { error: "Invalid aggregation" };

  const { start, stop } = normalizeTimeRange(time_range);
  const flux = buildFluxQuery({ farmId: farm_id, deviceId: device_id, metric, aggregation, start, stop });
  const rows = await influxQueryApi.collectRows(flux);

  return { metric, aggregation, farm_id, device_id: device_id || "all", start, stop, rows };
}

// ──────────────── Tool Definitions ────────────────

const tools = [
  {
    definition: {
      type: "function",
      function: {
        name: "list_farms",
        description: "List all available farms with their IDs and names. Call this when user asks about their farms.",
        parameters: { type: "object", properties: {} }
      }
    },
    handler: handleListFarms
  },
  {
    definition: {
      type: "function",
      function: {
        name: "list_devices",
        description: "List all IoT devices for a specific farm. Returns device ID, name, location, and moisture threshold.",
        parameters: {
          type: "object",
          properties: {
            farm_id: { type: "string", description: "The UUID of the farm" }
          },
          required: ["farm_id"]
        }
      }
    },
    handler: handleListDevices
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_latest_sensor_data",
        description: "Fetch the most recent temperature, humidity, and soil moisture reading for a specific device.",
        parameters: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The UUID of the device" }
          },
          required: ["device_id"]
        }
      }
    },
    handler: handleGetLatestSensorData
  },
  {
    definition: {
      type: "function",
      function: {
        name: "start_irrigation",
        description: "Start the irrigation pump for a specific device. Queues a START_IRRIGATION command for the device to pick up.",
        parameters: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The UUID of the device" },
            duration_seconds: { type: "integer", description: "Duration in seconds to run the pump (default: 60)", minimum: 1, default: 60 }
          },
          required: ["device_id"]
        }
      }
    },
    handler: handleStartIrrigation
  },
  {
    definition: {
      type: "function",
      function: {
        name: "stop_irrigation",
        description: "Stop the irrigation pump for a specific device. Queues a STOP_IRRIGATION command for the device to pick up.",
        parameters: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The UUID of the device" }
          },
          required: ["device_id"]
        }
      }
    },
    handler: handleStopIrrigation
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_pump_status",
        description: "Check the current pump/irrigation status for a specific device. Returns last irrigation time, pending commands, and whether the pump is currently running.",
        parameters: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The UUID of the device" }
          },
          required: ["device_id"]
        }
      }
    },
    handler: handleGetPumpStatus
  },
  {
    definition: {
      type: "function",
      function: {
        name: "query_sensor_history",
        description: "Query historical sensor data from InfluxDB with aggregation. Use for trends, averages, min/max over time periods.",
        parameters: {
          type: "object",
          properties: {
            farm_id: { type: "string", description: "The UUID of the farm" },
            device_id: { type: "string", description: "Optional: filter by specific device UUID" },
            metric: { type: "string", enum: ALLOWED_METRICS, description: "The sensor metric to query" },
            aggregation: { type: "string", enum: ALLOWED_AGGREGATIONS, description: "Aggregation function to apply" },
            time_range: { type: "string", description: "Time range like '1d', '7d', '30d'" }
          },
          required: ["farm_id", "metric", "aggregation", "time_range"]
        }
      }
    },
    handler: handleQueryInfluxData
  }
];

module.exports = {
  tools,
  ALLOWED_METRICS,
  ALLOWED_AGGREGATIONS
};
