const { User } = require('../models');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

exports.getUsers = async () => {
  const { Farm } = require('../models');
  try {
    return await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{ model: Farm }]
    });
  } catch (error) {
    logger.error('Error fetching users from service', { error: error.message });
    throw error;
  }
};

exports.addUser = async (name, username, phone, role, password, farmId) => {
  const { Farm } = require('../models');
  const whatsappService = require('./whatsapp.service');
  try {
    if (!name || !username || !phone || !password) {
      throw new Error('Name, Username, Phone and Password are required');
    }

    if (!farmId) {
      throw new Error('A farm must be selected');
    }

    // Verify farm exists
    const farm = await Farm.findByPk(farmId);
    if (!farm) {
      throw new Error('Selected farm does not exist');
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      throw new Error('Phone number already exists');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const newUser = await User.create({
      name,
      username,
      phone,
      role: role || 'user',
      password: hashedPassword,
      farm_id: farmId
    });

    // Send WhatsApp intro message if connected
    try {
      const status = whatsappService.getStatus(farm.id);
      if (status && status.status === 'connected') {
        const introMessage = `👋 Welcome to Smart Irrigation, ${name}! You've been added to *${farm.name}*. You can now interact with our system via WhatsApp. Send 'help' to get started.`;
        await whatsappService.sendMessage(farm.id, phone, introMessage);
        logger.info('WhatsApp intro message sent to new user', { userId: newUser.id, farmId: farm.id, phone });
      } else {
        logger.info('WhatsApp not connected for farm, skipping intro message', { farmId: farm.id });
      }
    } catch (whatsappErr) {
      logger.warn('Failed to send WhatsApp intro message', { farmId: farm.id, phone, error: whatsappErr.message });
    }

    // Reload user with farm for response
    const fullUser = await User.findByPk(newUser.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Farm }]
    });

    return fullUser.toJSON();
  } catch (error) {
    logger.error('Error adding user from service', { error: error.message });
    throw error;
  }
};

exports.authenticate = async (username, password) => {
  const { Farm } = require('../models');
  try {
    const user = await User.findOne({ 
      where: { 
        [require('sequelize').Op.or]: [
          { username: username },
          { phone: username }
        ]
      },
      include: [{ model: Farm }]
    });

    if (!user) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    return userResponse;
  } catch (error) {
    logger.error('Authentication error in service', { error: error.message });
    throw error;
  }
};

exports.deleteUser = async (id) => {
  try {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }
    await user.destroy();
  } catch (error) {
    logger.error('Error deleting user from service', { error: error.message });
    throw error;
  }
};
