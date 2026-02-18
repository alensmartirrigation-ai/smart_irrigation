const { Point } = require('@influxdata/influxdb-client');
const { influxWriteApi, influxQueryApi, influxBucket } = require('../config/influxClient');
const { DeviceReading, Device } = require('../models');
const logger = require('../utils/logger');

const ingestReading = async (deviceId, readingData) => {
  const { temperature, humidity, moisture, recorded_at } = readingData;
  const timestamp = recorded_at ? new Date(recorded_at) : new Date();

  // 1. Write to Postgres
  try {
    await DeviceReading.create({
      device_id: deviceId,
      temperature,
      humidity,
      moisture,
      recorded_at: timestamp
    });
  } catch (err) {
    logger.error(`Failed to write device reading to Postgres for device ${deviceId}`, { error: err.message });
    throw err;
  }

  // 2. Write to InfluxDB
  try {
    // Ideally we should fetch farm_id to tag it, but for now just device_id
    // If we need farm_id, we can fetch Device include Farm, or just tag device_id
    const point = new Point('device_readings')
      .tag('device_id', deviceId)
      .floatField('temperature', parseFloat(temperature))
      .floatField('humidity', parseFloat(humidity))
      .floatField('moisture', parseFloat(moisture))
      .timestamp(timestamp);
      
    influxWriteApi.writePoint(point);
    // Flush immediately or let the buffer handle it? 
    // Default buffer is fine, but for low volume we can flush.
    // influxWriteApi.flush(); 
  } catch (err) {
    logger.error(`Failed to write device reading to InfluxDB for device ${deviceId}`, { error: err.message });
    // Don't throw here if PG succeeded, we want partial success? 
    // Or maybe we do want to throw. For now, log error.
  }
  
  return { status: 'success', deviceId, timestamp };
};

const getReadings = async (deviceId, duration = '24h') => {
  try {
    const fluxQuery = `
      from(bucket: "${influxBucket}")
        |> range(start: -${duration})
        |> filter(fn: (r) => r["_measurement"] == "device_readings")
        |> filter(fn: (r) => r["device_id"] == "${deviceId}")
        |> filter(fn: (r) => r["_field"] == "temperature" or r["_field"] == "humidity" or r["_field"] == "moisture")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
    `;

    const result = [];
    await new Promise((resolve, reject) => {
      influxQueryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          result.push({
            time: o._time,
            temperature: o.temperature,
            humidity: o.humidity,
            moisture: o.moisture
          });
        },
        error(error) {
          logger.error('InfluxDB Query Error', { error });
          reject(error);
        },
        complete() {
          resolve();
        }
      });
    });

    return result;
  } catch (err) {
    logger.error(`Failed to fetch readings for device ${deviceId}`, { error: err.message });
    throw err;
  }
};

module.exports = {
  ingestReading,
  getReadings
};
