const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const Farm = sequelize.define('Farm', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message_platform: {
    type: DataTypes.STRING,
    defaultValue: 'whatsapp'
  },
  connection_status: {
    type: DataTypes.ENUM('connected', 'disconnected', 'pending'),
    defaultValue: 'disconnected'
  },
  credentials: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  timestamps: true,
  tableName: 'farms'
});

module.exports = Farm;
