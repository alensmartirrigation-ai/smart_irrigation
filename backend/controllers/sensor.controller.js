const { ingestReadings, deleteReadingsByFarmId } = require('../services/sensorService');
const { queryAllFieldsHistory, buildRange, toPositiveInt } = require('../services/farmService');
const asyncHandler = require('../utils/asyncHandler');

exports.ingest = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const readings = payload.readings ? payload.readings : [payload];
  const count = await ingestReadings(readings);
  res.status(201).json({ message: 'Sensor data ingested', count });
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

exports.deleteByFarmId = asyncHandler(async (req, res) => {
  const { farmId } = req.params;
  await deleteReadingsByFarmId(farmId);
  res.status(200).json({ message: `All sensor data for farm ${farmId} deleted` });
});
