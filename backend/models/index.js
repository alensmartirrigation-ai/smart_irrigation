const sequelize = require('../utils/database');
const User = require('./User');
const Farm = require('./Farm');
const Device = require('./Device');
const UserFarm = require('./UserFarm');
const FarmDevice = require('./FarmDevice');
const DeviceIrrigationStatus = require('./DeviceIrrigationStatus');

const models = {
  User,
  Farm,
  Device,
  UserFarm,
  FarmDevice,
  DeviceIrrigationStatus
};

// Initialize associations
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  ...models
};
