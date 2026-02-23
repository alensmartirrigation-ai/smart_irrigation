const express = require('express');
const { record, getHistory, startLog, stopLog } = require('../controllers/irrigation.controller');
const validationMiddleware = require('../middleware/validationMiddleware');
const { irrigationPayloadSchema, irrigationLogPayloadSchema } = require('../validators/irrigationSchema');

const router = express.Router();

router.post('/irrigation', validationMiddleware(irrigationPayloadSchema), record);
router.get('/irrigation/:farmId', getHistory);

router.post('/irrigation/log/start', validationMiddleware(irrigationLogPayloadSchema), startLog);
router.post('/irrigation/log/stop', validationMiddleware(irrigationLogPayloadSchema), stopLog);

module.exports = router;
