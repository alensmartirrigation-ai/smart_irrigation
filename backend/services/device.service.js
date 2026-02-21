const { Point } = require('@influxdata/influxdb-client');
const { influxWriteApi, influxQueryApi, influxBucket } = require('../config/influxClient');
const { DeviceReading, Device } = require('../models');
const logger = require('../utils/logger');

const ingestReading = async (deviceId, readingData) => {
  const { temperature, humidity, moisture, is_irrigating, irrigation_duration, recorded_at } = readingData;
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

    // Update Irrigation Status Summary
    if (is_irrigating) {
      const { DeviceIrrigationStatus } = require('../models');
      await DeviceIrrigationStatus.upsert({
        device_id: deviceId,
        last_irrigated_at: timestamp,
        last_duration_seconds: parseInt(irrigation_duration || 0),
        updated_at: timestamp
      });
    }
  } catch (err) {
    logger.error(`Failed to write device reading to Postgres for device ${deviceId}`, { error: err.message });
    throw err;
  }

  // 2. Write to InfluxDB
  try {
    const point = new Point('device_readings')
      .tag('device_id', deviceId)
      .floatField('temperature', parseFloat(temperature))
      .floatField('humidity', parseFloat(humidity))
      .floatField('moisture', parseFloat(moisture))
      .intField('is_irrigating', parseInt(is_irrigating || 0))
      .intField('irrigation_duration', parseInt(irrigation_duration || 0))
      .timestamp(timestamp);
      
    influxWriteApi.writePoint(point);
  } catch (err) {
    logger.error(`Failed to write device reading to InfluxDB for device ${deviceId}`, { error: err.message });
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
        |> filter(fn: (r) => r["_field"] == "temperature" or r["_field"] == "humidity" or r["_field"] == "moisture" or r["_field"] == "is_irrigating" or r["_field"] == "irrigation_duration")
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
            moisture: o.moisture,
            is_irrigating: o.is_irrigating,
            irrigation_duration: o.irrigation_duration
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

const getIrrigationData = async (deviceId, duration = '7d') => {
  try {
    // 1. Get summary from SQL
    const { DeviceIrrigationStatus } = require('../models');
    const summary = await DeviceIrrigationStatus.findOne({ where: { device_id: deviceId } });

    // 2. Get history from Influx (only points where is_irrigating == 1)
    const fluxQuery = `
      from(bucket: "${influxBucket}")
        |> range(start: -${duration})
        |> filter(fn: (r) => r["_measurement"] == "device_readings")
        |> filter(fn: (r) => r["device_id"] == "${deviceId}")
        |> filter(fn: (r) => r["_field"] == "is_irrigating" or r["_field"] == "irrigation_duration")
        |> filter(fn: (r) => r["_value"] > 0)
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
    `;

    const history = [];
    await new Promise((resolve, reject) => {
      influxQueryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          history.push({
            time: o._time,
            duration_left: o.irrigation_duration
          });
        },
        error(error) { reject(error); },
        complete() { resolve(); }
      });
    });

    return { summary, history };
  } catch (err) {
    logger.error(`Failed to fetch irrigation data for device ${deviceId}`, { error: err.message });
    throw err;
  }
};

module.exports = {
  ingestReading,
  getReadings,
  getIrrigationData
};
