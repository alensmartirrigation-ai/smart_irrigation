const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegram.controller');

router.post('/webhook', telegramController.webhook);

// These would normally be protected by admin middleware, mimicking existing basic auth setup if any
router.get('/status', telegramController.getStatus);
router.post('/reconnect', telegramController.reconnect);
router.post('/send-test', telegramController.sendTest);

module.exports = router;
