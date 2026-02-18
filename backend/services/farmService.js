const { Farm, User, UserFarm } = require('../models');
const { influxQueryApi, influxBucket } = require('../config/influxClient');
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



const toPositiveInt = (value, fallback, max = 500) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const runFluxQuery = async (query) => influxQueryApi.collectRows(query);

const buildRange = (start, stop = 'now()') => {
  return `|> range(start: ${start}, stop: ${stop})`;
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
  |> range(start: -30d)
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
  if (!row) {
    return null;
  }
  return {
    value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    timestamp: row._time,
  };
};

const queryHistory = async (farmId, field, rangeClause, limit = 20) => {
  const safeLimit = toPositiveInt(limit, 20, 500);
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}" and r["_field"] == "${field}")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${safeLimit})
`;
  const rows = await runFluxQuery(query);
  return rows.map((row) => ({
    value: typeof row._value === 'number' ? Number(row._value.toFixed(2)) : row._value,
    timestamp: row._time,
  }));
};

const parseDurationWindow = (window) => {
  const match = /^([0-9]+)([smhdw])$/.exec(window);
  if (!match) {
    return null;
  }
  const amount = Number.parseInt(match[1], 10);
  return {
    amount,
    unit: match[2],
    full: `${amount}${match[2]}`,
  };
};

const computeTrendAdvanced = async (farmId, field, window = '6h') => {
  const normalized = parseDurationWindow(window);
  if (!normalized) {
    return 'stable';
  }

  const recent = await queryMean(farmId, field, buildRange(`-${normalized.full}`));
  const earlierStart = `-${normalized.amount * 2}${normalized.unit}`;
  const earlierStop = `-${normalized.full}`;
  const earlier = await queryMean(farmId, field, buildRange(earlierStart, earlierStop));

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

const queryAllFieldsHistory = async (rawFarmId, rangeClause, limit = 50) => {
  const farmId = sanitizeId(rawFarmId);
  const safeLimit = toPositiveInt(limit, 50, 1000);
  const query = `
from(bucket: "${influxBucket}")
  ${rangeClause}
  |> filter(fn: (r) => r["_measurement"] == "sensor_readings" and r["farm_id"] == "${farmId}")
  |> pivot(rowKey:["_time", "sensor_id"], columnKey:["_field"], valueColumn:"_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${safeLimit})
`;
  const rows = await runFluxQuery(query);
  return rows.map((row) => ({
    timestamp: row._time,
    sensor_id: row.sensor_id,
    temperature: row.temperature,
    humidity: row.humidity,
  }));
};

const getFarms = async () => {
    try {
        const farms = await Farm.findAll({
            include: [{ model: User, attributes: { exclude: ['password'] }, through: { attributes: [] } }]
        });
        return farms.map(f => f.toJSON());
    } catch (error) {
        logger.error('Failed to get farms', { error: error.message });
        return [];
    }
};

const createFarm = async (name) => {
    try {
        const farm = await Farm.create({ name });
        logger.info('Farm created', { id: farm.id, name: farm.name });
        return farm;
    } catch (error) {
        logger.error('Failed to create farm', { error: error.message });
        throw error;
    }
};

const updateFarmConnection = async (farmId, platform, status, credentials) => {
    try {
        const farm = await Farm.findByPk(farmId);
        if (!farm) throw new Error('Farm not found');
        
        if (platform !== undefined) farm.message_platform = platform;
        if (status !== undefined) farm.connection_status = status;
        if (credentials !== undefined) farm.credentials = credentials;
        
        await farm.save();
        logger.info('Farm connection updated', { farmId, status: farm.connection_status });
        return farm;
    } catch (error) {
        logger.error('Failed to update farm connection', { farmId, error: error.message });
        throw error;
    }
};

const deleteFarm = async (farmId) => {
    try {
        const farm = await Farm.findByPk(farmId);
        if (!farm) throw new Error('Farm not found');
        await farm.destroy();
        logger.info('Farm deleted', { farmId });
        return true;
    } catch (error) {
        logger.error('Failed to delete farm', { farmId, error: error.message });
        throw error;
    }
};

module.exports = {
  getFarms,
  createFarm,
  updateFarmConnection,
  deleteFarm,
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
  toPositiveInt,
};
