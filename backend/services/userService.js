const User = require('../models/User');
const sequelize = require('../utils/database');
const logger = require('../utils/logger');
const config = require('../config/default');

class UserService {
  constructor() {}

  async init() {
    try {
      await sequelize.authenticate();
      logger.info('Database connection established successfully.');
      
      // Sync models
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized.');

      await this.seedAdmin();
    } catch (error) {
      logger.error('Unable to connect to the database:', { error: error.message });
      throw error;
    }
  }

  async seedAdmin() {
    try {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount === 0) {
        await User.create({
          name: config.admin.name,
          username: config.admin.username,
          password: config.admin.password,
          role: 'admin',
          farmName: config.admin.farmName,
          whatsapp: {
            jid: '',
            name: '',
            connectedAt: null
          }
        });
        logger.info('Default admin user seeded in PostgreSQL');
      }
    } catch (error) {
      logger.error('Failed to seed admin user', { error: error.message });
    }
  }

  async getAdminInfo() {
    try {
      const admin = await User.findOne({ 
        where: { role: 'admin' },
        attributes: { exclude: ['password'] }
      });
      return admin ? admin.toJSON() : null;
    } catch (error) {
      logger.error('Failed to get admin info', { error: error.message });
      return null;
    }
  }

  async saveAdminInfo(name, farmName) {
    try {
      const admin = await User.findOne({ where: { role: 'admin' } });
      if (admin) {
        admin.name = name;
        admin.farmName = farmName;
        await admin.save();
        const { password, ...adminInfo } = admin.toJSON();
        return adminInfo;
      }
      return null;
    } catch (error) {
      logger.error('Failed to save admin info', { error: error.message });
      return null;
    }
  }

  async updateAdminWhatsAppDetails(jid, platformName) {
    try {
      const admin = await User.findOne({ where: { role: 'admin' } });
      if (admin) {
        admin.whatsapp = {
          jid,
          name: platformName || 'Unknown',
          connectedAt: new Date().toISOString()
        };
        await admin.save();
        logger.info('Admin WhatsApp details updated in PostgreSQL', { jid });
      }
    } catch (error) {
      logger.error('Failed to update admin WhatsApp details', { error: error.message });
    }
  }

  async authenticate(username, password) {
    try {
      const user = await User.findOne({
        where: {
          [sequelize.Sequelize.Op.or]: [
            { username: username },
            { phone: username }
          ]
        }
      });

      if (user && user.password === password) {
        const { password, ...userInfo } = user.toJSON();
        return userInfo;
      }
      return null;
    } catch (error) {
      logger.error('Authentication failed', { error: error.message });
      return null;
    }
  }

  async updatePassword(username, newPassword) {
    try {
      const user = await User.findOne({ where: { username } });
      if (user) {
        user.password = newPassword;
        await user.save();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to update password', { error: error.message });
      return false;
    }
  }

  async addUser(name, phone) {
    try {
      if (!name || !phone) {
        throw new Error('Name and phone are required');
      }

      const normalizedPhone = phone.replace(/\D/g, '');

      const exists = await User.findOne({ where: { phone: normalizedPhone } });
      if (exists) {
        throw new Error('User with this phone number already exists');
      }

      const newUser = await User.create({
        name,
        phone: normalizedPhone,
        role: 'user',
        username: normalizedPhone,
        password: normalizedPhone
      });

      return newUser.toJSON();
    } catch (error) {
      logger.error('Failed to add user', { error: error.message });
      throw error;
    }
  }

  async getUsers() {
    try {
      const users = await User.findAll({
        attributes: { exclude: ['password'] }
      });
      return users.map(u => u.toJSON());
    } catch (error) {
      logger.error('Failed to get users', { error: error.message });
      return [];
    }
  }
}

module.exports = new UserService();
