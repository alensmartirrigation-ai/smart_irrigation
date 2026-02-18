const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const FarmDevice = sequelize.define('FarmDevice', {
  farm_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'farms',
      key: 'id'
    }
  },
  device_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'devices',
      key: 'id'
    }
  }
}, {
  timestamps: false,
  tableName: 'farm_devices'
});

module.exports = FarmDevice;
