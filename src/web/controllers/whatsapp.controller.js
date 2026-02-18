const whatsappService = require('../../app/services/whatsapp.service');
const logger = require('../../app/utils/logger');

const getStatus = (req, res) => {
  res.status(200).json(whatsappService.getStatus());
};

const sendMessage = async (req, res, next) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing "to" or "message" field' });
    }
    await whatsappService.sendMessage(to, message);
    res.status(200).json({ status: 'success', message: 'Message sent successfully' });
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await whatsappService.logout();
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Failed to logout WhatsApp', { error: error.message });
    next(error);
  }
};

module.exports = {
  getStatus,
  sendMessage,
  logout,
};
