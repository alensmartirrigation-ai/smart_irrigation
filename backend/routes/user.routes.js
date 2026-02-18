const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const logger = require('../utils/logger');

// Get Admin Info
router.get('/admin/info', async (req, res) => {
  try {
    const info = await userService.getAdminInfo();
    res.json(info);
  } catch (error) {
    logger.error('Failed to get admin info', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve admin information' });
  }
});

// Update Admin Info
router.post('/admin/setup', async (req, res) => {
  try {
    const { name, farmName } = req.body;
    if (!name || !farmName) {
      return res.status(400).json({ error: 'Name and Farm Name are required' });
    }
    const info = await userService.saveAdminInfo(name, farmName);
    logger.info('Admin info updated', { name, farmName });
    res.json({ message: 'Admin info saved successfully', info });
  } catch (error) {
    logger.error('Failed to save admin info', { error: error.message });
    res.status(500).json({ error: 'Failed to save admin information' });
  }
});

// Get Users
router.get('/users', async (req, res) => {
  try {
    const users = await userService.getUsers();
    res.json(users);
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Add User
router.post('/users', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone are required' });
    }
    const newUser = await userService.addUser(name, phone);
    logger.info('User added', { name, phone });
    res.status(201).json({ message: 'User added successfully', user: newUser });
  } catch (error) {
    logger.error('Failed to add user', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
