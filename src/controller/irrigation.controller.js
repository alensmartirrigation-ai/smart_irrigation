const { recordIrrigation, getIrrigationHistory } = require('../services/irrigationService');
const asyncHandler = require('../utils/asyncHandler');

exports.record = asyncHandler(async (req, res) => {
  const { farm_id, duration_minutes, timestamp } = req.body;
  
  if (!farm_id || !duration_minutes) {
    return res.status(400).json({ error: 'farm_id and duration_minutes are required' });
  }

  const result = await recordIrrigation(farm_id, duration_minutes, timestamp);
  res.status(201).json(result);
});

exports.getHistory = asyncHandler(async (req, res) => {
  const { farmId } = req.params;
  const { limit } = req.query;
  
  const history = await getIrrigationHistory(farmId, limit ? parseInt(limit) : 5);
  res.json(history);
});
