const whatsappService = require('../services/whatsapp.service');
const logger = require('../utils/logger');

const getStatus = (req, res) => {
  const { farmId } = req.query;
  if (!farmId) {
      return res.status(400).json({ error: 'Missing farmId query parameter' });
  }
  res.status(200).json(whatsappService.getStatus(farmId));
};

const sendMessage = async (req, res, next) => {
  try {
    const { farmId, to, message } = req.body;
    if (!farmId || !to || !message) {
      return res.status(400).json({ error: 'Missing "farmId", "to", or "message" field' });
    }
    await whatsappService.sendMessage(farmId, to, message);
    res.status(200).json({ status: 'success', message: 'Message sent successfully' });
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { farmId } = req.body;
    if (!farmId) {
        return res.status(400).json({ error: 'Missing "farmId" field' });
    }
    await whatsappService.logout(farmId);
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Failed to logout WhatsApp', { error: error.message });
    next(error);
  }
};

const reconnect = async (req, res, next) => {
  try {
    const { farmId } = req.body;
    if (!farmId) {
        return res.status(400).json({ error: 'Missing "farmId" field' });
    }
    await whatsappService.init(farmId);
    res.status(200).json({ status: 'success', message: 'Reconnection initiated' });
  } catch (error) {
    logger.error('Failed to reconnect WhatsApp', { error: error.message });
    next(error);
  }
};

module.exports = {
  getStatus,
  sendMessage,
  logout,
  reconnect
};
