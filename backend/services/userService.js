const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User, Farm, UserFarm, sequelize } = require('../models');
const logger = require('../utils/logger');
const config = require('../config/default');

const SALT_ROUNDS = 10;

class UserService {
  constructor() {}

  async init() {
    try {
      if (sequelize.authenticate) {
        await sequelize.authenticate();
        logger.info('Database connection established successfully.');
      }

      // Sync models
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized.');

      await this.seedAdmin();
    } catch (error) {
      logger.error('Database initialization failed', { error: error.message });
      throw error;
    }
  }

  async seedAdmin() {
    try {
      if (!config.admin?.phone || !config.admin?.password) {
        logger.warn('Admin config missing. Skipping admin seed.');
        return;
      }

      const normalizedPhone = config.admin.phone.replace(/\D/g, '');

      const existingAdmin = await User.findOne({
        where: { role: 'admin' }
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(config.admin.password, SALT_ROUNDS);

        await User.create({
          name: config.admin.name || 'Admin',
          username: normalizedPhone,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'admin'
        });

        logger.info('Default admin seeded securely');
      }

    } catch (error) {
      logger.error('Failed to seed admin', { error: error.message });
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
      throw error;
    }
  }

  async saveAdminInfo(details) {
    try {
      const admin = await User.findOne({ where: { role: 'admin' } });
      if (!admin) {
        throw new Error('Admin account not found');
      }

      const { name, phone, username, password } = details;
      if (name) admin.name = name;
      
      if (phone) {
        const normalizedPhone = phone.replace(/\D/g, '');
        admin.phone = normalizedPhone;
      }
      
      if (username) admin.username = username;
      
      if (password) {
        admin.password = await bcrypt.hash(password, SALT_ROUNDS);
      }

      await admin.save();
      const { password: _, ...adminInfo } = admin.toJSON();
      return adminInfo;
    } catch (error) {
      logger.error('Failed to save admin info', { error: error.message });
      throw error;
    }
  }

  async authenticate(identifier, password) {
    try {
      if (!identifier || !password) return null;

      const normalizedPhone = identifier.replace(/\D/g, '');

      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username: identifier },
            { phone: normalizedPhone }
          ]
        }
      });

      if (!user) return null;

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return null;

      const { password: _, ...userInfo } = user.toJSON();
      return userInfo;

    } catch (error) {
      logger.error('Authentication failed', { error: error.message });
      return null;
    }
  }

  async addUser(name, phone, role = 'user') {
    try {
      if (!name || !phone) {
        throw new Error('Name and phone are required');
      }

      const normalizedPhone = phone.replace(/\D/g, '');

      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { phone: normalizedPhone },
            { username: normalizedPhone }
          ]
        }
      });

      if (existingUser) {
        throw new Error('User with this phone number already exists');
      }

      // Default password for new users is their phone number
      const hashedPassword = await bcrypt.hash(normalizedPhone, SALT_ROUNDS);

      const newUser = await User.create({
        name,
        phone: normalizedPhone,
        username: normalizedPhone,
        password: hashedPassword,
        role
      });

      const { password: _, ...userInfo } = newUser.toJSON();
      return userInfo;

    } catch (error) {
      logger.error('Failed to add user', { error: error.message });
      throw error;
    }
  }

  async updatePassword(userId, newPassword) {
    try {
      if (!newPassword) throw new Error('New password required');

      const user = await User.findByPk(userId);
      if (!user) throw new Error('User not found');

      user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await user.save();

      return true;

    } catch (error) {
      logger.error('Failed to update password', { error: error.message });
      throw error;
    }
  }

  async updateUser(id, details) {
    try {
      const user = await User.findByPk(id);
      if (!user) throw new Error('User not found');

      const { name, phone, role } = details;

      if (name) user.name = name;

      if (phone) {
        const normalizedPhone = phone.replace(/\D/g, '');

        const exists = await User.findOne({
          where: {
            phone: normalizedPhone,
            id: { [Op.ne]: id }
          }
        });

        if (exists) throw new Error('Phone already in use');

        user.phone = normalizedPhone;
        user.username = normalizedPhone;
      }

      if (role) user.role = role;

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

      return users.map(user => user.toJSON());

    } catch (error) {
      logger.error('Failed to get users', { error: error.message });
      return [];
    }
  }

  async getUserById(id) {
    try {
      const user = await User.findByPk(id, {
        attributes: { exclude: ['password'] },
        include: [{ model: Farm, through: { attributes: [] } }]
      });

      return user ? user.toJSON() : null;

    } catch (error) {
      logger.error('Failed to fetch user', { error: error.message });
      return null;
    }
  }
}

module.exports = new UserService();
