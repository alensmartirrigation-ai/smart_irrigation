const { Point } = require('@influxdata/influxdb-client');
const {
  influxWriteApi,
  influxQueryApi,
  influxBucket,
} = require('../../config/influxClient');
const logger = require('../utils/logger');

const thresholds = {
  soil_moisture: { min: 32 },
  temperature: { max: 37 },
  humidity: { min: 30, max: 85 },
};

const evaluateThresholds = ({
  farm_id,
  sensor_id,
  temperature,
  humidity,
  soil_moisture,
}) => {
  const alerts = [];
  if (soil_moisture < thresholds.soil_moisture.min) {
    alerts.push({
      type: 'soil_moisture_low',
      message: `Soil moisture ${soil_moisture}% dropped below ${thresholds.soil_moisture.min}%`,
      value: soil_moisture,
      threshold: thresholds.soil_moisture.min,
      severity: 'warning',
    });
  }
  if (temperature > thresholds.temperature.max) {
    alerts.push({
      type: 'temperature_high',
      message: `Temperature ${temperature}°C exceeded ${thresholds.temperature.max}°C`,
      value: temperature,
      threshold: thresholds.temperature.max,
      severity: 'warning',
    });
  }
  if (humidity < thresholds.humidity.min) {
    alerts.push({
      type: 'humidity_low',
      message: `Humidity ${humidity}% dropped below ${thresholds.humidity.min}%`,
      value: humidity,
      threshold: thresholds.humidity.min,
      severity: 'notice',
    });
  } else if (humidity > thresholds.humidity.max) {
    alerts.push({
      type: 'humidity_high',
      message: `Humidity ${humidity}% exceeded ${thresholds.humidity.max}%`,
      value: humidity,
      threshold: thresholds.humidity.max,
      severity: 'notice',
    });
  }
  return alerts;
};

const recordAlert = async (farmId, sensorId, alert) => {
  const point = new Point('farm_alerts')
    .tag('farm_id', farmId)
    .tag('sensor_id', sensorId)
    .tag('alert_type', alert.type)
    .tag('status', 'active')
    .stringField('message', alert.message)
    .floatField('value', alert.value)
    .floatField('threshold', alert.threshold || alert.value)
    .stringField('severity', alert.severity || 'info');
  influxWriteApi.writePoint(point);
  logger.info('Alert recorded', {
    farm_id: farmId,
    sensor_id: sensorId,
    type: alert.type,
  });
};

const getActiveAlerts = async (farmId) => {
  const farmFilter = farmId ? ` and r["farm_id"] == "${farmId}"` : '';
  const query = `
from(bucket: "${influxBucket}")
  |> range(start: -30d)
  |> filter(fn: (r) => r["_measurement"] == "farm_alerts" and r["status"] == "active"${farmFilter})
  |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
  |> sort(columns:["_time"], desc: true)
`;
  const rows = await influxQueryApi.collectRows(query);
  return rows.map((row) => ({
    farm_id: row.farm_id,
    sensor_id: row.sensor_id,
    type: row.alert_type,
    message: row.message,
    value: row.value,
    threshold: row.threshold,
    severity: row.severity,
    timestamp: row._time,
  }));
};

module.exports = {
  thresholds,
  evaluateThresholds,
  recordAlert,
  getActiveAlerts,
};
