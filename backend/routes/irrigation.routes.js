const express = require('express');
const { record, getHistory } = require('../controllers/irrigation.controller');
const validationMiddleware = require('../middleware/validationMiddleware');
const { irrigationPayloadSchema } = require('../validators/irrigationSchema');

const router = express.Router();

router.post('/irrigation', validationMiddleware(irrigationPayloadSchema), record);
router.get('/irrigation/:farmId', getHistory);

module.exports = router;
