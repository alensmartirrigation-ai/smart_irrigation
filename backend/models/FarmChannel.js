const { DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const FarmChannel = sequelize.define('FarmChannel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  farm_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  provider: {
    type: DataTypes.ENUM('whatsapp', 'telegram'),
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'disconnected'
  },
  config: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  last_connected_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_error: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'farm_channels',
  indexes: [
    {
      unique: true,
      fields: ['farm_id', 'provider']
    }
  ]
});

FarmChannel.associate = (models) => {
  FarmChannel.belongsTo(models.Farm, { foreignKey: 'farm_id' });
};

module.exports = FarmChannel;
