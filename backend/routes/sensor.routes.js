const express = require('express');
const { ingest, getByFarmId, deleteByFarmId } = require('../controllers/sensor.controller');
const validationMiddleware = require('../middleware/validationMiddleware');
const { sensorPayloadSchema } = require('../validators/sensorSchema');

const router = express.Router();

router.post(
  '/sensor/ingest',
  validationMiddleware(sensorPayloadSchema),
  ingest
);

router.get('/sensor/farm/:farmId', getByFarmId);
router.delete('/sensor/farm/:farmId', deleteByFarmId);

module.exports = router;
