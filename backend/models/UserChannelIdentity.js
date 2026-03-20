const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const UserChannelIdentity = sequelize.define('UserChannelIdentity', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  provider: {
    type: DataTypes.ENUM('whatsapp', 'telegram'),
    allowNull: false
  },
  external_user_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  external_chat_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  external_username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'unlinked'
  },
  linked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  timestamps: true,
  tableName: 'user_channel_identities',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'provider']
    }
  ]
});

UserChannelIdentity.associate = (models) => {
  UserChannelIdentity.belongsTo(models.User, { foreignKey: 'user_id' });
};

module.exports = UserChannelIdentity;
