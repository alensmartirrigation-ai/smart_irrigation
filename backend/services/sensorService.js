const { Point } = require('@influxdata/influxdb-client');
const { influxWriteApi, influxDeleteApi, influxBucket, influxOrg } = require('../config/influxClient');
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
    return 0;
  }

  for (const reading of readings) {
    const {
      farm_id,
      sensor_id,
      temperature,
      humidity,
      soil_moisture,
      timestamp,
    } = reading;
    const point = new Point('sensor_readings')
      .tag('farm_id', farm_id)
      .tag('sensor_id', sensor_id)
      .floatField('temperature', temperature)
      .floatField('humidity', humidity)
      .floatField('soil_moisture', soil_moisture);
    point.timestamp(timestamp || new Date());
    influxWriteApi.writePoint(point);

    const alerts = evaluateThresholds(reading);
    for (const alert of alerts) {
      await recordAlert(farm_id, sensor_id, alert);
    }
  }

  await influxWriteApi.flush();
  logger.info('Sensor batch ingested', { count: readings.length });
  return readings.length;
};

module.exports = {
  ingestReadings,
  deleteReadingsByFarmId,
};
