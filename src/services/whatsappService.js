const twilio = require('twilio');
const logger = require('../utils/logger');

const sendWhatsAppMessage = async (phone, messageText) => {

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials missing: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER (or TWILIO_PHONE_NUMBER)');
  }

  // Normalize: strip whatsapp: prefix if present, extract digits, rebuild proper format
  const normalizeWhatsApp = (num) => {
    const digits = num.replace(/^whatsapp:/i, '').replace(/\D/g, '');
    return `whatsapp:+${digits}`;
  };
  const from = normalizeWhatsApp(fromNumber);
  const to = normalizeWhatsApp(phone);

  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    from,
    to,
    body: messageText,
  });

  logger.info('WhatsApp message sent via Twilio', { phone, sid: message.sid });
  return { sid: message.sid };
};

module.exports = {
  sendWhatsAppMessage,
};
