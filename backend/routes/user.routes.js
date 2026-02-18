const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
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
    const { name, username, phone, role, password } = req.body;
    
    const newUser = await userService.addUser(name, username, phone, role, password);
    
    logger.info('User added', { name, username, phone, role, password });
    res.status(201).json({ 
      message: 'User added successfully', 
      user: newUser 
    });
  } catch (error) {
    logger.error('Failed to add user', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.post('/users/:id/farms', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { farmId } = req.body;
    await userService.linkFarm(req.params.id, farmId);
    res.json({ message: 'Farm linked successfully' });
  } catch (error) {
    logger.error('Failed to link farm', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:id/farms/:farmId', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    await userService.unlinkFarm(req.params.id, req.params.farmId);
    res.json({ message: 'Farm unlinked successfully' });
  } catch (error) {
    logger.error('Failed to unlink farm', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
