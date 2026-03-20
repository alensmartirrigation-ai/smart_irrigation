const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');
const channelStateService = require('./channelState.service');
const inboundMessagingService = require('./inboundMessaging.service');
const { Farm } = require('../models');

class TelegramService {
  constructor() {
    this.token = env.TELEGRAM_BOT_TOKEN;
    this.webhookUrl = env.TELEGRAM_WEBHOOK_URL;
    this.webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
    this.botUsername = env.TELEGRAM_BOT_USERNAME;
    this.enabled = env.ENABLE_TELEGRAM;

    this.apiBase = `https://api.telegram.org/bot${this.token}`;
    
    this.botInfo = null;
    this.webhookHealth = false;
  }

  async init() {
    if (!this.enabled || !this.token) {
      logger.info('Telegram service is disabled or missing token.');
      return;
    }

    try {
      this.botInfo = await this.getMe();
      if (!this.botUsername) {
         this.botUsername = this.botInfo.username;
      }
      
      if (this.webhookUrl) {
         await this.registerWebhook();
      }

      await this.syncGlobalStatus();
      logger.info('Telegram service initialized', { botUsername: this.botUsername, webhookHealth: this.webhookHealth });
    } catch (err) {
      logger.error('Failed to initialize Telegram service', { error: err.message });
      this.webhookHealth = false;
      await this.syncGlobalStatus();
    }
  }

  async getMe() {
     const res = await axios.get(`${this.apiBase}/getMe`);
     if (!res.data.ok) throw new Error('API returned !ok on getMe');
     return res.data.result;
  }

  async registerWebhook() {
    try {
      const infoRes = await axios.get(`${this.apiBase}/getWebhookInfo`);
      if (infoRes.data.result.url === this.webhookUrl && infoRes.data.result.has_custom_certificate) {
          logger.info('Webhook already registered with a custom certificate, skipping re-registration.');
          this.webhookHealth = true;
          return;
      }

      const url = `${this.apiBase}/setWebhook`;
      const payload = { url: this.webhookUrl };
      if (this.webhookSecret) {
         payload.secret_token = this.webhookSecret;
      }
      const res = await axios.post(url, payload);
      this.webhookHealth = res.data.ok;
      logger.info('Telegram webhook registered', { webhookUrl: this.webhookUrl, ok: res.data.ok });
    } catch (err) {
      this.webhookHealth = false;
      logger.error('Failed to register telegram webhook', { error: err.message });
      throw err;
    }
  }

  async getBotInfo() {
    return {
      username: this.botUsername,
      health: this.webhookHealth
    };
  }

  getStatus() {
    return {
       status: (this.enabled && this.webhookHealth) ? 'connected' : 'disconnected',
       botUsername: this.botUsername
    };
  }

  async syncGlobalStatus() {
     const farms = await Farm.findAll();
     const status = (this.enabled && this.webhookHealth) ? 'connected' : 'disconnected';
     for (const farm of farms) {
         await channelStateService.updateState(farm.id, 'telegram', status);
     }
  }

  async sendMessage(chatId, text, options = {}) {
     if (!this.enabled) throw new Error('Telegram is disabled');
     const res = await axios.post(`${this.apiBase}/sendMessage`, {
         chat_id: chatId,
         text: text,
         ...options
     });
     return res.data;
  }

  validateWebhookSecret(req) {
     if (!this.webhookSecret) return true;
     const token = req.headers['x-telegram-bot-api-secret-token'];
     return token === this.webhookSecret;
  }

  async handleContactShare(contact, chatId, fromUser) {
    const { UserChannelIdentity, User } = require('../models');
    try {
        const phone = contact.phone_number;
        const users = await User.findAll();
        const normalizePhone = (p) => String(p || '').replace(/\D/g, '');
        const normalizedReceived = normalizePhone(phone);
        
        const matchedUser = users.find(u => normalizePhone(u.phone) === normalizedReceived);

        if (!matchedUser) {
            await this.sendMessage(chatId, "Sorry, this phone number is not registered in our Smart Irrigation system. Please add the user in the admin dashboard first.", {
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        const [identity, created] = await UserChannelIdentity.findOrCreate({
            where: { user_id: matchedUser.id, provider: 'telegram' },
            defaults: {
                external_user_id: String(fromUser.id),
                external_chat_id: String(chatId),
                external_username: fromUser.username || null,
                display_name: fromUser.first_name || 'User',
                status: 'linked',
                linked_at: new Date()
            }
        });
        
        if (!created) {
            await identity.update({
                external_chat_id: String(chatId), 
                external_user_id: String(fromUser.id),
                external_username: fromUser.username || null,
                status: 'linked',
                linked_at: new Date()
            });
        }

        await this.sendMessage(chatId, `✅ Account linked successfully, ${matchedUser.name}! You can now receive alerts and send commands.`, {
            reply_markup: { remove_keyboard: true }
        });
        logger.info(`Telegram linked to user ${matchedUser.username}`);

    } catch (err) {
        logger.error('Error handling contact share', { error: err.message });
        await this.sendMessage(chatId, "An error occurred while linking your account.");
    }
  }

  async handleWebhookUpdate(update) {
    if (!update.message) return;
    
    const chatId = update.message.chat.id;

    if (update.message.contact) {
        return await this.handleContactShare(update.message.contact, chatId, update.message.from);
    }

    if (!update.message.text) return;
    const text = update.message.text;

    const { UserChannelIdentity, User } = require('../models');
    
    try {
        const identities = await UserChannelIdentity.findAll({
            where: { provider: 'telegram', external_chat_id: String(chatId) },
            include: [{ model: User }]
        });

        if (!identities || identities.length === 0) {
            logger.warn(`Prompted unlinked telegram chat ${chatId} for contact.`);
            await this.sendMessage(chatId, "Welcome to Smart Irrigation! 🌾\n\nTo link your account to this Telegram bot, please share your contact number using the button below.", {
                reply_markup: {
                    keyboard: [
                        [{ text: "📲 Share Contact to Link Account", request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return;
        }

        const farmId = identities[0].User.farm_id;

        await inboundMessagingService.handleInboundMessage({
            provider: 'telegram',
            farmId,
            sender: String(chatId),
            text: text,
            reply: async (replyText) => {
                await this.sendMessage(chatId, replyText);
            }
        });

    } catch (err) {
        logger.error('Error handling telegram inbound update', { error: err.message });
    }
  }
}

module.exports = new TelegramService();
