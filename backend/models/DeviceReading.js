const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const DeviceReading = sequelize.define('DeviceReading', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  temperature: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  humidity: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  moisture: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  recorded_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  timestamps: false,
  tableName: 'device_readings'
});

DeviceReading.associate = (models) => {
  DeviceReading.belongsTo(models.Device, { foreignKey: 'device_id' });
};

module.exports = DeviceReading;
