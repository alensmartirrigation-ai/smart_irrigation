const sequelize = require('../utils/database');
const User = require('./User');
const Farm = require('./Farm');
const Device = require('./Device');
const FarmDevice = require('./FarmDevice');
const DeviceIrrigationStatus = require('./DeviceIrrigationStatus');
const DeviceReading = require('./DeviceReading');
const DeviceCommand = require('./DeviceCommand');

const models = {
  User,
  Farm,
  Device,
  FarmDevice,
  DeviceIrrigationStatus,
  DeviceReading,
  DeviceCommand
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
