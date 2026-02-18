const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const UserFarm = sequelize.define('UserFarm', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  UserId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  FarmId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'farms',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'user_farms'
});

module.exports = UserFarm;
