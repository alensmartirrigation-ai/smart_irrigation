const sequelize = require('../utils/database');
const User = require('./User');
const Farm = require('./Farm');
const UserFarm = require('./UserFarm');

const models = {
  User,
  Farm,
  UserFarm
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
