const { ingestReadings } = require('../services/sensorService');
const { queryAllFieldsHistory, buildRange } = require('../services/farmService');
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
    limit ? parseInt(limit) : 50
  );
  res.json(history);
});
