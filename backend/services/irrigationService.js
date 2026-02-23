const { Point } = require('@influxdata/influxdb-client');
const {
  influxWriteApi,
  influxQueryApi,
  influxBucket,
} = require('../config/influxClient');
const { sanitizeId } = require('./farmService');
const logger = require('../utils/logger');

const DeviceIrrigationStatus = require('../models/DeviceIrrigationStatus');

/**
 * Record a new irrigation event.
 * @param {string} farmId - Unique identifier for the farm.
 * @param {number} durationMinutes - How long the watering lasted.
 * @param {string} [timestamp] - Optional RFC3339 timestamp.
 * @param {string} [deviceId] - Optional device UUID.
 */
const recordIrrigation = async (farmId, durationMinutes, timestamp, deviceId) => {
  const sanitizedFarmId = sanitizeId(farmId);
  const point = new Point('irrigation_logs')
    .tag('farm_id', sanitizedFarmId)
    .floatField('duration_minutes', parseFloat(durationMinutes));

  if (deviceId) {
    point.tag('device_id', deviceId);
  }

  if (timestamp) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      point.timestamp(d.getTime());
    }
  }

  influxWriteApi.writePoint(point);
  await influxWriteApi.flush();

  logger.info('Irrigation event recorded', { farmId: sanitizedFarmId, durationMinutes, deviceId });
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
    device_id: row.device_id,
  }));
};

/**
 * Get start/stop times for irrigation logs specific to a device.
 */
const getDeviceIrrigationEvents = async (deviceId, duration = '7d') => {
  const query = `
    from(bucket: "${influxBucket}")
      |> range(start: -${duration})
      |> filter(fn: (r) => r["_measurement"] == "irrigation_logs" and r["device_id"] == "${deviceId}")
      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
      |> sort(columns: ["_time"])
  `;

  const rows = await influxQueryApi.collectRows(query);
  return rows.map(row => {
    // Duration is in minutes, _time is the End Timestamp
    const endTime = new Date(row._time).getTime();
    const startTime = endTime - (row.duration_minutes * 60 * 1000);
    return {
      start_time: startTime,
      end_time: endTime,
      duration_minutes: row.duration_minutes
    };
  });
};

/**
 * Record the start time of the pump from ESP32.
 */
const recordIrrigationStart = async (deviceId, farmId, timestampSec) => {
  const dateObj = new Date(timestampSec * 1000);
  
  await DeviceIrrigationStatus.upsert({
    device_id: deviceId,
    last_irrigated_at: dateObj,
    updated_at: new Date()
  });

  logger.info('Irrigation event START recorded', { deviceId, farmId, dateObj });
  return { status: 'success', deviceId, timestamp: dateObj };
};

/**
 * Record the stop time of the pump from ESP32, and compute duration.
 */
const recordIrrigationStop = async (deviceId, farmId, timestampSec) => {
  const stopDate = new Date(timestampSec * 1000);
  
  const status = await DeviceIrrigationStatus.findOne({ where: { device_id: deviceId } });
  
  if (!status || !status.last_irrigated_at) {
    logger.warn('Received STOP event but no START event recorded', { deviceId, farmId });
    return { status: 'error', message: 'No matching START event found' };
  }

  const durationSec = Math.floor((stopDate.getTime() - status.last_irrigated_at.getTime()) / 1000);
  const durationMin = Math.max(durationSec / 60, 0.1); // min 0.1 minutes if immediately toggled
  
  // Persist the full historical record into InfluxDB using existing function
  await recordIrrigation(farmId, durationMin, stopDate, deviceId);
  
  // Update SQL status table
  await DeviceIrrigationStatus.upsert({
    device_id: deviceId,
    last_duration_seconds: durationSec,
    updated_at: new Date()
  });

  logger.info('Irrigation event STOP recorded', { deviceId, farmId, durationSec });
  return { status: 'success', deviceId, duration_minutes: durationMin };
};

module.exports = {
  recordIrrigation,
  getIrrigationHistory,
  getDeviceIrrigationEvents,
  recordIrrigationStart,
  recordIrrigationStop,
};
