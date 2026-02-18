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

// Associations defined in index or initialization
Farm.associate = (models) => {
  Farm.belongsToMany(models.User, { through: models.UserFarm });
};

module.exports = Farm;
