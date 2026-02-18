const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const logger = require('../utils/logger');

router.get('/users', async (req, res) => {
  try {
    const users = await userService.getUsers();
    res.json(users);
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone are required' });
    }
    const newUser = await userService.addUser(name, phone, role);
    logger.info('User added', { name, phone });
    res.status(201).json({ message: 'User added successfully', user: newUser });
  } catch (error) {
    logger.error('Failed to add user', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});


module.exports = router;
