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
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const info = await userService.saveAdminInfo(name);
    logger.info('Admin info updated', { name });
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

// Update User
router.put('/users/:id', async (req, res) => {
  try {
    const updatedUser = await userService.updateUser(req.params.id, req.body);
    logger.info('User updated', { id: req.params.id });
    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    logger.error('Failed to update user', { id: req.params.id, error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Delete User
router.delete('/users/:id', async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    logger.info('User deleted', { id: req.params.id });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', { id: req.params.id, error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Link Farm to User
router.post('/users/:id/farms', async (req, res) => {
  try {
    const { farmId } = req.body;
    if (!farmId) {
      return res.status(400).json({ error: 'farmId is required' });
    }
    await userService.linkFarm(req.params.id, farmId);
    res.json({ message: 'Farm linked to user successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Unlink Farm from User
router.delete('/users/:id/farms/:farmId', async (req, res) => {
  try {
    await userService.unlinkFarm(req.params.id, req.params.farmId);
    res.json({ message: 'Farm unlinked from user successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
