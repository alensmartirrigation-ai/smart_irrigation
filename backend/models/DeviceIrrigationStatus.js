const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const DeviceIrrigationStatus = sequelize.define('DeviceIrrigationStatus', {
  device_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  last_irrigated_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'device_irrigation_status'
});

DeviceIrrigationStatus.associate = (models) => {
  DeviceIrrigationStatus.belongsTo(models.Device, { foreignKey: 'device_id' });
};

module.exports = DeviceIrrigationStatus;
