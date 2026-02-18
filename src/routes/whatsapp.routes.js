const express = require('express');
const { sendMessage, handleWebhook, verifyWebhook } = require('../controller/whatsapp.controller');

const router = express.Router();

router.post('/whatsapp/send', sendMessage);
router.get('/whatsapp/webhook', verifyWebhook);
router.post('/whatsapp/webhook', handleWebhook);

module.exports = router;
