const express = require('express');
const { record, getHistory } = require('../controller/irrigation.controller');

const router = express.Router();

router.post('/irrigation', record);
router.get('/irrigation/:farmId', getHistory);

module.exports = router;
