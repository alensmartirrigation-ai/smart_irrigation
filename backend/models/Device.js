const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const Device = sequelize.define('Device', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false, // We are managing created_at manually or via default, and no updated_at requested
  tableName: 'devices'
});

Device.associate = (models) => {
  Device.belongsToMany(models.Farm, { through: models.FarmDevice, foreignKey: 'device_id' });
  Device.hasOne(models.DeviceIrrigationStatus, { foreignKey: 'device_id', onDelete: 'CASCADE' });
  Device.hasMany(models.DeviceReading, { foreignKey: 'device_id', onDelete: 'CASCADE' });
};

module.exports = Device;
