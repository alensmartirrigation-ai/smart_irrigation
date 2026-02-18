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
  // Extend this if using Meta verification challenge
  return res.sendStatus(200);
};

exports.handleWebhook = asyncHandler(async (req, res) => {
  const { From, To, Body, MessageSid } = req.body;

  logger.info('WhatsApp Webhook Received', {
    from: From,
    to: To,
    body: Body,
    messageSid: MessageSid,
    timestamp: new Date().toISOString(),
  });

  if (!Body || !From) {
    return res.status(200).send('<Response></Response>');
  }

  let reply;

  try {
    reply = await runAgent(Body.trim());
  } catch (error) {
    logger.error('Agent execution failed', { error });
    reply = 'Sorry, something went wrong. Please try again.';
  }

  logger.info('WhatsApp Reply', { reply });

  await sendWhatsAppMessage(From, reply);

  return res.status(200).send('<Response></Response>');
});
