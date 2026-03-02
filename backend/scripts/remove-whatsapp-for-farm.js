/**
 * One-off script: remove WhatsApp connection for a farm by name.
 * Clears in-memory session, auth files, and DB session_id/connection_status.
 * Usage: node scripts/remove-whatsapp-for-farm.js "test 3"
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize, Farm } = require('../models');
const whatsappService = require('../services/whatsapp.service');
const path = require('path');
const fs = require('fs');

const farmName = process.argv[2] || 'test 3';

async function main() {
  try {
    await sequelize.authenticate();
    const farm = await Farm.findOne({ where: { name: farmName } });
    if (!farm) {
      console.log(`No farm found with name: "${farmName}"`);
      process.exit(1);
    }
    const farmId = farm.id;
    await whatsappService.destroySession(farmId, true);
    // Ensure auth folder is removed (service uses farmId; if service uses _key, path may differ)
    const baseAuthPath = path.join(process.cwd(), 'auth_info_baileys');
    const authPathByUuid = path.join(baseAuthPath, farmId);
    if (fs.existsSync(authPathByUuid)) {
      fs.rmSync(authPathByUuid, { recursive: true, force: true });
      console.log('Removed auth folder:', authPathByUuid);
    }
    console.log(`WhatsApp connection removed for farm: "${farmName}" (id: ${farmId})`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
