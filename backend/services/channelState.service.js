const { FarmChannel } = require('../models');
const logger = require('../utils/logger');

class ChannelStateService {
  constructor() {
    this.io = null;
  }

  setIO(io) {
    this.io = io;
  }

  async updateState(farmId, provider, status, configOrMetadata = {}) {
    if (!farmId || !provider) return;

    try {
      const { FarmChannel } = require('../models');
      const [channel, created] = await FarmChannel.findOrCreate({
        where: { farm_id: farmId, provider },
        defaults: {
          status,
          enabled: true,
          ...configOrMetadata
        }
      });

      if (!created) {
        await channel.update({
          status,
          ...configOrMetadata,
          ...(status === 'connected' ? { last_connected_at: new Date() } : {})
        });
      }

      if (this.io) {
        this.io.emit('channel_status', { 
          farmId: String(farmId), 
          provider, 
          status 
        });
        // We also want to trigger an update to farm details to UI
        this.io.emit('farm_channel_updated', channel.toJSON());
      }
    } catch (err) {
      logger.error(`Failed to update channel state for ${provider} on farm ${farmId}`, { error: err.message });
    }
  }

  async getChannelsForFarm(farmId) {
    const { FarmChannel } = require('../models');
    return await FarmChannel.findAll({ where: { farm_id: farmId } });
  }
}

module.exports = new ChannelStateService();
