const { Point } = require('@influxdata/influxdb-client');
const { influxWriteApi, influxDeleteApi, influxBucket, influxOrg } = require('../config/influxClient');
const { DeviceReading } = require('../models');
const { evaluateThresholds, recordAlert } = require('./alertService');
const logger = require('../utils/logger');

const deleteReadingsByFarmId = async (farmId) => {
  const start = new Date(0).toISOString();
  const stop = new Date().toISOString();
  
  // Tag predicate syntax for InfluxDB Delete API
  const predicate = `farm_id="${farmId}"`;

  logger.info(`Deleting sensor data for farm_id: ${farmId}`, { start, stop, predicate });

  await influxDeleteApi.postDelete({
    orgID: influxOrg, 
    bucket: influxBucket,
    body: {
      start,
      stop,
      predicate,
    },
  });
};

const ingestReadings = async (readings) => {
  if (!Array.isArray(readings) || readings.length === 0) {
    return { count: 0, commands: [] };
  }

  const commands = [];
  const { DeviceCommand } = require('../models');

  for (const reading of readings) {
    const {
      farm_id,
      sensor_id,
      temperature,
      humidity,
      soil_moisture,
      timestamp,
    } = reading;

    const ts = timestamp ? new Date(timestamp) : new Date();

    // 1. Write to Postgres
    try {
      await DeviceReading.create({
        device_id: sensor_id,
        temperature,
        humidity,
        moisture: soil_moisture,
        recorded_at: ts
      });
    } catch (err) {
      logger.error(`Failed to write sensor reading to Postgres for device ${sensor_id}`, { error: err.message });
    }

    // 2. Write to InfluxDB
    const point = new Point('device_readings')
      .tag('farm_id', farm_id)
      .tag('device_id', sensor_id)
      .floatField('temperature', temperature)
      .floatField('humidity', humidity)
      .floatField('moisture', soil_moisture);
    point.timestamp(ts);
    influxWriteApi.writePoint(point);

    const alerts = evaluateThresholds(reading);
    for (const alert of alerts) {
      await recordAlert(farm_id, sensor_id, alert);
    }

    // 3. Check for pending commands for this device (ESP32)
    try {
      const pendingCommands = await DeviceCommand.findAll({
        where: {
          device_id: sensor_id,
          status: 'PENDING'
        },
        order: [['created_at', 'ASC']]
      });

      if (pendingCommands.length > 0) {
        for (const cmd of pendingCommands) {
          commands.push({
            id: cmd.id,
            command: cmd.command,
            payload: cmd.payload
          });
          // Mark as SENT
          await cmd.update({ status: 'SENT' });
        }
      }
    } catch (err) {
      logger.error(`Failed to fetch pending commands for device ${sensor_id}`, { error: err.message });
    }
  }

  await influxWriteApi.flush();
  logger.info('Sensor batch ingested and persisted', { count: readings.length, commandsCount: commands.length });
  
  return {
    count: readings.length,
    commands: commands
  };
};

module.exports = {
  ingestReadings,
  deleteReadingsByFarmId,
};
