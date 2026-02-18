const {
  influxQueryApi,
  influxBucket,
} = require('../config/influxClient');
const logger = require('../utils/logger');
const { getActiveAlerts } = require('./alertService');

const sanitizeId = (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('farmId must be provided');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('farmId contains invalid characters');
  }
  return value;
};

const runFluxQuery = async (query) => influxQueryApi.collectRows(query);

const buildRange = (start, stop) => {
  const actualStop = stop || '24h';
  return `|> range(start: ${start}, stop: ${actualStop})`;
};

const queryMean = async (farmId, field, rangeClause) => {
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}" and r["_field"] == "${field}")
  |> mean()
`;
  const [{ _value } = {}] = await runFluxQuery(query);
  return typeof _value === 'number' ? Number(_value.toFixed(2)) : null;
};

const queryLatest = async (farmId, field) => {
  const query = `
from(bucket: "${influxBucket}")
  |> range(start: -30d, stop: 24h)
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}" and r["_field"] == "${field}")
  |> last()
`;
  const [row] = await runFluxQuery(query);
  if (!row) {
    return null;
  }
  return {
    value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    timestamp: row._time,
    sensor_id: row.sensor_id,
  };
};

const queryExtremes = async (farmId, field, rangeClause, type = 'max') => {
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}" and r["_field"] == "${field}")
  |> ${type}()
`;
  const [row] = await runFluxQuery(query);
  if (!row) return null;
  return {
    value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    timestamp: row._time,
  };
};

const queryHistory = async (farmId, field, rangeClause, limit = 20) => {
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}" and r["_field"] == "${field}")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${limit})
`;
  const rows = await runFluxQuery(query);
  return rows.map((row) => ({
    value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    timestamp: row._time,
  }));
};

const computeTrendAdvanced = async (farmId, field, window = '6h') => {
  const recent = await queryMean(farmId, field, buildRange(`-${window}`));
  // Previous window is from -(2 * window) to -(window)
  // For simplicity with InfluxDB duration strings like '6h', we'll rely on the caller passing correct formats
  // or handle basic conversion if needed. For now, we'll build the range manually.
  const stop = `-${window}`;
  const start = `-${parseInt(window) * 2}${window.replace(/[0-9]/g, '')}`;
  
  const earlier = await queryMean(farmId, field, buildRange(start, stop));

  if (recent === null || earlier === null) {
    return 'stable';
  }
  if (recent > earlier) {
    return 'increasing';
  }
  if (recent < earlier) {
    return 'decreasing';
  }
  return 'stable';
};

const computeTrend = async (farmId, field) => {
  return computeTrendAdvanced(farmId, field, '6h');
};

const getFarmContext = async (rawFarmId) => {
  const farmId = sanitizeId(rawFarmId);
  const fields = ['temperature', 'humidity', 'soil_moisture'];
  const averages = {};
  const latest = {};
  const trend = {};

  for (const field of fields) {
    averages[field] = await queryMean(farmId, field, buildRange('-24h'));
    latest[field] = await queryLatest(farmId, field);
    trend[field] = await computeTrend(farmId, field);
  }

  const alerts = await getActiveAlerts(farmId);
  logger.info('Farm context computed', { farmId });
  return {
    farm_id: farmId,
    latest_readings: latest,
    averages,
    trend,
    alerts,
  };
};

const queryAllFieldsHistory = async (farmId, rangeClause, limit = 50) => {
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}")
  |> pivot(rowKey:["_time", "sensor_id"], columnKey:["_field"], valueColumn:"_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${limit})
`;
  const rows = await runFluxQuery(query);
  return rows.map((row) => ({
    timestamp: row._time,
    sensor_id: row.sensor_id,
    temperature: row.temperature,
    humidity: row.humidity,
    soil_moisture: row.soil_moisture,
  }));
};

module.exports = {
  getFarmContext,
  sanitizeId,
  queryLatest,
  queryMean,
  computeTrend,
  computeTrendAdvanced,
  queryExtremes,
  queryHistory,
  queryAllFieldsHistory,
  buildRange,
};
