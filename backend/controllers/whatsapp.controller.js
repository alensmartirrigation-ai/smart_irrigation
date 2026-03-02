const whatsappService = require('../services/whatsapp.service');
const logger = require('../utils/logger');

const getStatus = (req, res, next) => {
  let { farmId } = req.query;
  farmId = typeof farmId === 'string' ? farmId.trim() : farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Missing farmId query parameter' });
  }
  try {
    const payload = whatsappService.getStatus(farmId);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.status(200).json(payload);
  } catch (err) {
    logger.error('WhatsApp getStatus failed', { farmId, error: err.message });
    next(err);
  }
};

const getDebugStatus = (req, res, next) => {
  let { farmId } = req.query;
  farmId = typeof farmId === 'string' ? farmId.trim() : farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Missing farmId query parameter' });
  }
  try {
    const payload = whatsappService.getDebugStatus(farmId);
    res.set('Cache-Control', 'no-store');
    res.status(200).json(payload);
  } catch (err) {
    logger.error('WhatsApp getDebugStatus failed', { farmId, error: err.message });
    next(err);
  }
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
  getDebugStatus,
  sendMessage,
  logout,
  reconnect
};
