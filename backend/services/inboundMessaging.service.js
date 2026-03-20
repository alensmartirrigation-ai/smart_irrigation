const logger = require('../utils/logger');
const aiService = require('./ai.service');
const { User, Farm, Device, UserChannelIdentity } = require('../models');
const { startIrrigation } = require('./device.service');

class InboundMessagingService {
  async handleInboundMessage({ provider, farmId, sender, text, reply }) {
    if (!text || !sender || !farmId) return;

    logger.info(`📩 Received from ${sender} (${provider}) for farm ${farmId}: ${text}`);

    // --- AUTHENTICATION CHECK ---
    try {
      const isAuthorized = await this.authorizeSender(provider, farmId, String(sender));
      if (!isAuthorized) {
        logger.warn(`Unauthorized ${provider} message from ${sender} to farm ${farmId} (Ignored)`);
        return;
      }
    } catch (authError) {
      logger.error(`${provider} auth check failed`, { error: authError.message });
      return; 
    }

    // --- COMMAND PARSING ---
    const lower = text.toLowerCase();
    if (lower.includes('turn on pump')) {
      try {
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = text.match(uuidRegex);
        const providedDeviceId = match ? match[0] : null;

        const farm = await Farm.findByPk(farmId, {
          include: [{ model: Device }]
        });
        const devices = farm ? farm.Devices : [];

        if (providedDeviceId) {
          const device = devices.find(d => d.id === providedDeviceId);
          if (device) {
            await startIrrigation(device.id, 60);
            await reply(`✅ Pump turned on for device: ${device.name || device.id}`);
          } else {
            await reply(`⚠️ Device ${providedDeviceId} not found or doesn't belong to this farm.`);
          }
        } else {
          if (devices.length === 0) {
            await reply('⚠️ No devices found for this farm.');
          } else if (devices.length === 1) {
            await startIrrigation(devices[0].id, 60);
            await reply(`✅ Pump turned on for device: ${devices[0].name || devices[0].id}`);
          } else {
            const deviceList = devices.map(d => `- ${d.name || 'Unnamed'}: ${d.id}`).join('\n');
            await reply(`Multiple devices found. Please reply with "turn on pump [ID]":\n${deviceList}`);
          }
        }
        return; 
      } catch (e) {
        logger.error(`Failed to handle pump command (${provider})`, { error: e.message });
        await reply('⚠️ Failed to process pump command.');
        return;
      }
    } else if (lower.includes('turn off pump') || lower.includes('stop irrigation')) {
      try {
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = text.match(uuidRegex);
        const providedDeviceId = match ? match[0] : null;

        const farm = await Farm.findByPk(farmId, {
          include: [{ model: Device }]
        });
        const devices = farm ? farm.Devices : [];
        const { stopIrrigation } = require('./device.service');

        if (providedDeviceId) {
          const device = devices.find(d => d.id === providedDeviceId);
          if (device) {
            await stopIrrigation(device.id);
            await reply(`✅ Pump turned off for device: ${device.name || device.id}`);
          } else {
            await reply(`⚠️ Device ${providedDeviceId} not found or doesn't belong to this farm.`);
          }
        } else {
          if (devices.length === 0) {
            await reply('⚠️ No devices found for this farm.');
          } else if (devices.length === 1) {
            await stopIrrigation(devices[0].id);
            await reply(`✅ Pump turned off for device: ${devices[0].name || devices[0].id}`);
          } else {
            const deviceList = devices.map(d => `- ${d.name || 'Unnamed'}: ${d.id}`).join('\n');
            await reply(`Multiple devices found. Please reply with "stop irrigation [ID]":\n${deviceList}`);
          }
        }
        return; 
      } catch (e) {
        logger.error(`Failed to handle stop command (${provider})`, { error: e.message });
        await reply('⚠️ Failed to process stop command.');
        return;
      }
    }

    // --- AI FALLBACK ---
    try {
      const aiReply = await aiService.generateResponse(text, [], { 
        conversationId: `${farmId}:${sender}`, 
        farmId: farmId,
        provider: provider
      });
      await reply(aiReply);
    } catch (error) {
      logger.error('Failed to send AI auto-reply', { farmId, provider, error: error.message });
    }
  }

  async authorizeSender(provider, farmId, senderId) {
    if (provider === 'whatsapp') {
      const cleanedSenderPhone = senderId.replace(/\D/g, '');
      const usersWithAccess = await User.findAll({ where: { farm_id: farmId } });
      return usersWithAccess.some(user => {
        if (!user.phone) return false;
        const cleanedDbPhone = user.phone.replace(/\D/g, '');
        const dbLast10 = cleanedDbPhone.slice(-10);
        const senderLast10 = cleanedSenderPhone.slice(-10);
        return dbLast10 === senderLast10;
      });
    } else if (provider === 'telegram') {
      const identity = await UserChannelIdentity.findOne({
        where: { provider: 'telegram', external_chat_id: senderId },
        include: [{ model: User, where: { farm_id: farmId } }]
      });
      return !!identity;
    }
    return false;
  }
}

module.exports = new InboundMessagingService();
