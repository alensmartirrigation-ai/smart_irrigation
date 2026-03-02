/**
 * One-off script: delete farms with the given names.
 * Removes linked users and farm_device rows first so the delete does not violate foreign keys.
 * Usage: node scripts/delete-farms-by-name.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize, Farm, User, FarmDevice } = require('../models');

const NAMES_TO_DELETE = ['farm-01', 'test'];

async function main() {
  try {
    await sequelize.authenticate();
    for (const name of NAMES_TO_DELETE) {
      const farms = await Farm.findAll({ where: { name } });
      for (const farm of farms) {
        const farmId = farm.id;
        const deletedUsers = await User.destroy({ where: { farm_id: farmId } });
        const deletedLinks = await FarmDevice.destroy({ where: { farm_id: farmId } });
        if (deletedUsers) console.log(`  Removed ${deletedUsers} user(s) linked to farm.`);
        if (deletedLinks) console.log(`  Removed ${deletedLinks} farm-device link(s).`);
        await farm.destroy();
        console.log(`Deleted farm: "${farm.name}" (id: ${farmId})`);
      }
      if (farms.length === 0) {
        console.log(`No farm found with name: "${name}"`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
