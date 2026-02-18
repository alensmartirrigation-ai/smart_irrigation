const { getFarmContext, sanitizeId } = require('../../app/services/farmService');
const { getActiveAlerts } = require('../../app/services/alertService');
const asyncHandler = require('../../app/utils/asyncHandler');

exports.getContext = asyncHandler(async (req, res) => {
  const data = await getFarmContext(req.params.farmId);
  res.json(data);
});

exports.getAlerts = asyncHandler(async (req, res) => {
  const farmId = req.query.farm_id;
  if (farmId) {
    sanitizeId(farmId);
  }
  const alerts = await getActiveAlerts(farmId);
  res.json({ alerts });
});
