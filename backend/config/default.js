module.exports = {
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin',
    name: process.env.ADMIN_NAME || 'Administrator',
    farmName: process.env.ADMIN_FARM_NAME || 'My Smart Farm'
  }
};
