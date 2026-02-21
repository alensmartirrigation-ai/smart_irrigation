const express = require('express');
const { ingest, getByFarmId, deleteByFarmId, getBySensorId } = require('../controllers/sensor.controller');
const validationMiddleware = require('../middleware/validationMiddleware');
const { sensorPayloadSchema } = require('../validators/sensorSchema');

const router = express.Router();

router.post(
  '/sensor/ingest',
  validationMiddleware(sensorPayloadSchema),
  ingest
);

router.get('/sensor/farm/:farmId', getByFarmId);
router.get('/sensor/:sensorId/history', getBySensorId);
router.delete('/sensor/farm/:farmId', deleteByFarmId);

module.exports = router;
