const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'user'),
    defaultValue: 'user'
  },
  phone: {
    type: DataTypes.STRING,
    unique: true
  },
  farm_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'farms',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'users'
});

User.associate = (models) => {
  User.belongsTo(models.Farm, { foreignKey: 'farm_id' });
};

module.exports = User;
