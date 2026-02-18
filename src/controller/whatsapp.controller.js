const asyncHandler = require('../utils/asyncHandler');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { runAgent } = require('../services/agentService');
const { normalizePhone } = require('../utils/phone');
const logger = require('../utils/logger');

exports.sendMessage = asyncHandler(async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      error: 'Missing required fields: to, message',
    });
  }

  const phone = normalizePhone(to);

  if (!phone) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const result = await sendWhatsAppMessage(phone, message);

  return res.json({
    success: true,
    ...result,
  });
});

exports.verifyWebhook = (req, res) => {
  return res.sendStatus(200);
};

exports.handleWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;
  
  // Evolution API sends notifications for various events. We care about MESSAGES_UPSERT.
  if (payload.event !== 'messages.upsert') {
    return res.status(200).send('Event ignored');
  }

  const data = payload.data;
  const message = data.message;
  const key = data.key;

  // Ignore messages sent by the bot itself
  if (key.fromMe) {
    return res.status(200).send('Self message ignored');
  }

  const From = key.remoteJid.split('@')[0]; // Extract number from JID
  const Body = message.conversation || message.extendedTextMessage?.text || '';

  if (!Body) {
    return res.status(200).send('Empty message ignored');
  }

  logger.info(`WhatsApp Webhook Received: ${From}: "${Body}"`);

  let reply;
  try {
    reply = await runAgent(Body.trim());
  } catch (error) {
    logger.error('Agent execution failed', { error });
    reply = 'Sorry, something went wrong. Please try again.';
  }

  logger.info(`WhatsApp Reply: "${reply}"`);

  await sendWhatsAppMessage(From, reply);

  return res.status(200).send('OK');
});
