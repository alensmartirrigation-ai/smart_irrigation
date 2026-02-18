const express = require('express');
const { getContext, getAlerts } = require('../controllers/farm.controller');
const farmService = require('../services/farmService');
const logger = require('../utils/logger');

const router = express.Router();

// Farm Context & Alerts (Existing)
router.get('/farm/:farmId/context', getContext);
router.get('/alerts/active', getAlerts);

// New Farm CRUD
router.get('/farms', async (req, res) => {
    try {
        const farms = await farmService.getFarms();
        res.json(farms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve farms' });
    }
});

router.post('/farms', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Farm name is required' });
        const farm = await farmService.createFarm(name);
        res.status(201).json(farm);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create farm' });
    }
});

router.put('/farms/:id', async (req, res) => {
    try {
        const { message_platform, connection_status, credentials } = req.body;
        const farm = await farmService.updateFarmConnection(
            req.params.id, 
            message_platform, 
            connection_status, 
            credentials
        );
        res.json(farm);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/farms/:id', async (req, res) => {
    try {
        await farmService.deleteFarm(req.params.id);
        res.json({ message: 'Farm deleted successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
