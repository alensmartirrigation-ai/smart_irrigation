const { Point } = require('@influxdata/influxdb-client');
const {
  influxWriteApi,
  influxQueryApi,
  influxBucket,
} = require('../../config/influxClient');
const { sanitizeId } = require('./farmService');
const logger = require('../utils/logger');

/**
 * Record a new irrigation event.
 * @param {string} farmId - Unique identifier for the farm.
 * @param {number} durationMinutes - How long the watering lasted.
 * @param {string} [timestamp] - Optional RFC3339 timestamp.
 */
const recordIrrigation = async (farmId, durationMinutes, timestamp) => {
  const sanitizedFarmId = sanitizeId(farmId);
  const point = new Point('irrigation_logs')
    .tag('farm_id', sanitizedFarmId)
    .floatField('duration_minutes', parseFloat(durationMinutes));

  if (timestamp) {
    point.timestamp(timestamp);
  }

  influxWriteApi.writePoint(point);
  await influxWriteApi.flush();

  logger.info('Irrigation event recorded', { farmId: sanitizedFarmId, durationMinutes });
  return { farmId: sanitizedFarmId, durationMinutes, timestamp: timestamp || new Date().toISOString() };
};

/**
 * Get the most recent irrigation events for a farm.
 * @param {string} farmId - Unique identifier for the farm.
 * @param {number} [limit=5] - Number of events to retrieve.
 */
const getIrrigationHistory = async (farmId, limit = 5) => {
  const sanitizedFarmId = sanitizeId(farmId);
  const query = `
    from(bucket: "${influxBucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r["_measurement"] == "irrigation_logs" and r["farm_id"] == "${sanitizedFarmId}")
      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: ${limit})
  `;

  const rows = await influxQueryApi.collectRows(query);
  return rows.map(row => ({
    timestamp: row._time,
    duration_minutes: row.duration_minutes,
    farm_id: row.farm_id,
  }));
};

module.exports = {
  recordIrrigation,
  getIrrigationHistory,
};
