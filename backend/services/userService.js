const { User, Farm, UserFarm, sequelize } = require('../models');
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
          role: 'admin'
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

  async saveAdminInfo(name) {
    try {
      const admin = await User.findOne({ where: { role: 'admin' } });
      if (admin) {
        admin.name = name;
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

  async updateUser(id, details) {
    try {
      const user = await User.findByPk(id);
      if (!user) throw new Error('User not found');
      
      const { name, phone, username, password } = details;
      if (name) user.name = name;
      if (phone) user.phone = phone;
      if (username) user.username = username;
      if (password) user.password = password;
      
      await user.save();
      const { password: _, ...userInfo } = user.toJSON();
      return userInfo;
    } catch (error) {
      logger.error('Failed to update user', { error: error.message });
      throw error;
    }
  }

  async deleteUser(id) {
    try {
      const user = await User.findByPk(id);
      if (!user) throw new Error('User not found');
      if (user.role === 'admin') throw new Error('Cannot delete admin user');
      
      await user.destroy();
      return true;
    } catch (error) {
      logger.error('Failed to delete user', { error: error.message });
      throw error;
    }
  }

  async linkFarm(userId, farmId) {
    try {
      const user = await User.findByPk(userId);
      const farm = await Farm.findByPk(farmId);
      if (!user || !farm) {
        throw new Error('User or Farm not found');
      }
      await user.addFarm(farm);
      logger.info('Linked user to farm', { userId, farmId });
      return true;
    } catch (error) {
      logger.error('Failed to link user to farm', { error: error.message });
      throw error;
    }
  }

  async unlinkFarm(userId, farmId) {
    try {
      const user = await User.findByPk(userId);
      const farm = await Farm.findByPk(farmId);
      if (!user || !farm) {
        throw new Error('User or Farm not found');
      }
      await user.removeFarm(farm);
      logger.info('Unlinked user from farm', { userId, farmId });
      return true;
    } catch (error) {
      logger.error('Failed to unlink user from farm', { error: error.message });
      throw error;
    }
  }

  async getUsers() {
    try {
      const users = await User.findAll({
        attributes: { exclude: ['password'] },
        include: [{ model: Farm, through: { attributes: [] } }]
      });
      return users.map(u => u.toJSON());
    } catch (error) {
      logger.error('Failed to get users', { error: error.message });
      return [];
    }
  }
}

module.exports = new UserService();
