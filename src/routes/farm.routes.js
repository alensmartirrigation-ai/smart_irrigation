const express = require('express');
const { getContext, getAlerts } = require('../controller/farm.controller');

const router = express.Router();

router.get('/farm/:farmId/context', getContext);
router.get('/alerts/active', getAlerts);

module.exports = router;
