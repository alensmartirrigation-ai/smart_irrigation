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
  session_id: {
    type: DataTypes.STRING, // UUID
    allowNull: true
  },
  auth_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  message_platform: {
    type: DataTypes.STRING,
    defaultValue: 'whatsapp'
  },
  connection_status: {
    type: DataTypes.ENUM('disconnected', 'connecting', 'qr_pending', 'connected'),
    defaultValue: 'disconnected'
  },
  last_connected_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_disconnect_reason: {
    type: DataTypes.STRING,
    allowNull: true
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
