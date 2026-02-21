const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const DeviceCommand = sequelize.define('DeviceCommand', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  command: {
    type: DataTypes.STRING(50), // e.g., 'TOGGLE_RELAY', 'RELAY_ON', 'RELAY_OFF'
    allowNull: false
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'SENT', 'EXECUTED', 'FAILED'),
    defaultValue: 'PENDING'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'device_commands'
});

DeviceCommand.associate = (models) => {
  DeviceCommand.belongsTo(models.Device, { foreignKey: 'device_id', onDelete: 'CASCADE' });
};

module.exports = DeviceCommand;
