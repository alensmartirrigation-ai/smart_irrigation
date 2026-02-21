const { ingestReadings, deleteReadingsByFarmId } = require('../services/sensorService');
const { queryAllFieldsHistory, queryBySensorId, buildRange, toPositiveInt } = require('../services/farmService');
const asyncHandler = require('../utils/asyncHandler');

exports.ingest = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const readings = payload.readings ? payload.readings : [payload];
  const { count, commands } = await ingestReadings(readings);
  res.status(201).json({ 
    message: 'Sensor data ingested', 
    count,
    commands: commands || []
  });
});

exports.getByFarmId = asyncHandler(async (req, res) => {
  const { farmId } = req.params;
  const { period, limit } = req.query;
  const history = await queryAllFieldsHistory(
    farmId,
    buildRange(period || '-24h'),
    toPositiveInt(limit, 50, 1000)
  );
  res.json(history);
});

exports.getBySensorId = asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  const { period, limit } = req.query;
  const history = await queryBySensorId(
    sensorId,
    buildRange(period || '-24h'),
    toPositiveInt(limit, 50, 1000)
  );
  res.json(history);
});

exports.deleteByFarmId = asyncHandler(async (req, res) => {
  const { farmId } = req.params;
  await deleteReadingsByFarmId(farmId);
  res.status(200).json({ message: `All sensor data for farm ${farmId} deleted` });
});
