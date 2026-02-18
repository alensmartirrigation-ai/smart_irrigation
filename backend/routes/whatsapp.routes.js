const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');

router.get('/whatsapp/status', whatsappController.getStatus);
router.post('/whatsapp/send', whatsappController.sendMessage);
router.post('/whatsapp/logout', whatsappController.logout);

module.exports = router;
