const { recordIrrigation, getIrrigationHistory } = require('../../app/services/irrigationService');
const { toPositiveInt } = require('../../app/services/farmService');
const asyncHandler = require('../../app/utils/asyncHandler');

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
