const telegramService = require('../services/telegram.service');
const logger = require('../utils/logger');

exports.webhook = async (req, res) => {
  if (!telegramService.validateWebhookSecret(req)) {
     logger.warn('Unauthorized Telegram webhook attempt');
     return res.status(401).json({ error: 'Unauthorized' });
  }

  // Acknowledge quickly to Telegram
  res.status(200).send('OK');

  try {
     await telegramService.handleWebhookUpdate(req.body);
  } catch (err) {
     logger.error('Failed to process telegram webhook update', { error: err.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const status = telegramService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
};

exports.reconnect = async (req, res) => {
  try {
    await telegramService.init();
    res.json(telegramService.getStatus());
  } catch (err) {
    res.status(500).json({ error: 'Failed to reconnect' });
  }
};

exports.sendTest = async (req, res) => {
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId is required' });

  try {
    await telegramService.sendMessage(chatId, 'Test message from Smart Irrigation system 🚀');
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to send test message via Telegram', { error: err.message });
    res.status(500).json({ error: 'Failed to send test message' });
  }
};
