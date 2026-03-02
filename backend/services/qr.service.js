/**
 * Shared QR code generation service.
 * Used by WhatsApp session linking and can be reused for device pairing, share links, etc.
 * All QR payloads are turned into data URLs (PNG) suitable for <img src="..."> or display components.
 */
const qrcode = require('qrcode');

const DEFAULT_OPTIONS = {
  errorCorrectionLevel: 'H',
  margin: 2,
  scale: 10,
};

/**
 * Generate a QR code as a data URL (e.g. data:image/png;base64,...).
 * @param {string} payload - Raw string to encode (e.g. Baileys pairing code, JSON config, URL).
 * @param {object} [options] - Override qrcode options (errorCorrectionLevel, margin, scale).
 * @returns {Promise<string>} Data URL string.
 */
async function toDataURL(payload, options = {}) {
  if (payload == null || typeof payload !== 'string') {
    throw new Error('qr.service: payload must be a non-empty string');
  }
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return qrcode.toDataURL(payload, opts);
}

/**
 * Generate a QR code as a Buffer (PNG). Useful for streaming or file storage.
 * @param {string} payload - Raw string to encode.
 * @param {object} [options] - Override qrcode options.
 * @returns {Promise<Buffer>}
 */
async function toBuffer(payload, options = {}) {
  if (payload == null || typeof payload !== 'string') {
    throw new Error('qr.service: payload must be a non-empty string');
  }
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return qrcode.toBuffer(payload, { ...opts, type: 'png' });
}

module.exports = {
  toDataURL,
  toBuffer,
  DEFAULT_OPTIONS,
};
