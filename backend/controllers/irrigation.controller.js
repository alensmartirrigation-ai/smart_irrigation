const { recordIrrigation, getIrrigationHistory, recordIrrigationStart, recordIrrigationStop } = require('../services/irrigationService');
const { toPositiveInt } = require('../services/farmService');
const asyncHandler = require('../utils/asyncHandler');

exports.record = asyncHandler(async (req, res) => {
  const { farm_id, duration_minutes, timestamp } = req.validatedBody;
  const result = await recordIrrigation(farm_id, duration_minutes, timestamp);
  res.status(201).json(result);
});

exports.getHistory = asyncHandler(async (req, res) => {
  const { farmId } = req.params;
  const { limit } = req.query;

  const history = await getIrrigationHistory(farmId, toPositiveInt(limit, 5, 100));
  res.json(history);
});

exports.startLog = asyncHandler(async (req, res) => {
  const { device_id, farm_id, timestamp } = req.validatedBody;
  const result = await recordIrrigationStart(device_id, farm_id, timestamp);
  res.status(201).json(result);
});

exports.stopLog = asyncHandler(async (req, res) => {
  const { device_id, farm_id, timestamp } = req.validatedBody;
  const result = await recordIrrigationStop(device_id, farm_id, timestamp);
  res.status(201).json(result);
});
