const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/device.controller');

router.post('/devices', deviceController.createDevice);
router.get('/devices', deviceController.getAllDevices);
router.get('/devices/:id', deviceController.getDeviceById);
router.put('/devices/:id', deviceController.updateDevice);
router.delete('/devices/:id', deviceController.deleteDevice);
router.get('/devices/:id/readings', deviceController.getDeviceReadings);

module.exports = router;
