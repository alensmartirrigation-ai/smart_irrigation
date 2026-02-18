const axios = require('axios');
const logger = require('../utils/logger');

const sendWhatsAppMessage = async (phone, messageText) => {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instanceName) {
    throw new Error('Evolution API credentials missing: set EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE_NAME');
  }

  // Normalize phone number for Evolution API (remove any non-digits)
  const digits = phone.replace(/^whatsapp:/i, '').replace(/\D/g, '');
  
  try {
    const response = await axios.post(
      `${apiUrl}/message/sendText/${instanceName}`,
      {
        number: digits,
        text: messageText,
        linkPreview: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
      }
    );

    const data = response.data;
    const messageId = data.key?.id || data.messageId;

    logger.info('WhatsApp message sent via Evolution API', { phone: digits, sid: messageId });
    return { sid: messageId };
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error('Failed to send WhatsApp message via Evolution API', { error: errorMsg });
    throw new Error(`Evolution API error: ${errorMsg}`);
  }
};

module.exports = {
  sendWhatsAppMessage,
};
