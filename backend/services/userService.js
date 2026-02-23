const { User } = require('../models');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

exports.getUsers = async () => {
  const { Farm } = require('../models');
  try {
    return await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{
        model: Farm,
        through: { attributes: [] }
      }]
    });
  } catch (error) {
    logger.error('Error fetching users from service', { error: error.message });
    throw error;
  }
};

exports.linkFarm = async (userId, farmId) => {
  const { UserFarm, Farm } = require('../models');
  try {
    logger.info('Linking farm to user', { userId, farmId });
    const user = await User.findByPk(userId);
    const farm = await Farm.findByPk(farmId);
    
    if (!user) {
      logger.error('User not found for linking', { userId });
      throw new Error('User not found');
    }
    if (!farm) {
      logger.error('Farm not found for linking', { farmId });
      throw new Error('Farm not found');
    }
    
    logger.info('Found user and farm, adding association', { user: user.name, farm: farm.name });
    
    // Try both methods: addFarm (magic method) or direct create in UserFarm
    try {
      await user.addFarm(farm);
      logger.info('Successfully added farm to user using addFarm');
    } catch (magicErr) {
      logger.warn('addFarm magic method failed, trying direct UserFarm creation', { error: magicErr.message });
      await UserFarm.create({
        UserId: userId,
        FarmId: farmId
      });
      logger.info('Successfully added farm to user using direct UserFarm creation');
    }
    
    return true;
  } catch (error) {
    logger.error('Error linking farm to user', { userId, farmId, error: error.message });
    throw error;
  }
};

exports.unlinkFarm = async (userId, farmId) => {
  const { UserFarm, Farm } = require('../models');
  try {
    logger.info('Unlinking farm from user', { userId, farmId });
    const user = await User.findByPk(userId);
    const farm = await Farm.findByPk(farmId);
    
    if (!user || !farm) {
      throw new Error('User or Farm not found');
    }
    
    try {
      await user.removeFarm(farm);
      logger.info('Successfully removed farm from user using removeFarm');
    } catch (magicErr) {
      logger.warn('removeFarm magic method failed, trying direct UserFarm deletion', { error: magicErr.message });
      await UserFarm.destroy({
        where: {
          UserId: userId,
          FarmId: farmId
        }
      });
      logger.info('Successfully removed farm from user using direct UserFarm deletion');
    }
    
    return true;
  } catch (error) {
    logger.error('Error unlinking farm from user', { userId, farmId, error: error.message });
    throw error;
  }
};

exports.addUser = async (name, username, phone, role, password, farmIds) => {
  const { Farm, UserFarm } = require('../models');
  const whatsappService = require('./whatsapp.service');
  try {
    if (!name || !username || !phone || !password) {
      throw new Error('Name, Username, Phone and Password are required');
    }

    // Validate farmIds - at least 1 farm is mandatory
    if (!farmIds || !Array.isArray(farmIds) || farmIds.length === 0) {
      throw new Error('At least one farm must be selected');
    }

    // Verify all farm IDs exist
    const farms = await Farm.findAll({ where: { id: farmIds } });
    if (farms.length !== farmIds.length) {
      throw new Error('One or more selected farms do not exist');
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      throw new Error('Phone number already exists');
    }

    // Hash the default password (the phone number)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const newUser = await User.create({
      name,
      username,
      phone,
      role: role || 'user',
      password: hashedPassword
    });

    // Link all selected farms to the user
    for (const farm of farms) {
      try {
        await newUser.addFarm(farm);
      } catch (magicErr) {
        await UserFarm.create({ UserId: newUser.id, FarmId: farm.id });
      }
    }

    // Send WhatsApp intro message via each connected farm
    for (const farm of farms) {
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
        // Don't fail user creation if WhatsApp message fails
      }
    }

    // Reload user with farms for response
    const fullUser = await User.findByPk(newUser.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Farm, through: { attributes: [] } }]
    });

    return fullUser.toJSON();
  } catch (error) {
    logger.error('Error adding user from service', { error: error.message });
    throw error;
  }
};

exports.authenticate = async (username, password) => {
  try {
    const user = await User.findOne({ 
      where: { 
        [require('sequelize').Op.or]: [
          { username: username },
          { phone: username }
        ]
      } 
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
