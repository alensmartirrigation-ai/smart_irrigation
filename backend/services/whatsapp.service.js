const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const aiService = require('./ai.service');
const userService = require('./userService');

// Silence verbose logs from libsignal (used by Baileys)
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

console.info = function (...args) {
  if (args[0] && typeof args[0] === 'string' && (
      args[0].includes('Closing session:') || 
      args[0].includes('Opening session:') ||
      args[0].includes('Migrating session to:') ||
      args[0].includes('Removing old closed session:')
  )) {
    return;
  }
  originalConsoleInfo.apply(console, args);
};

console.warn = function (...args) {
    if (args[0] && typeof args[0] === 'string' && (
        args[0].includes('Session already closed') || 
        args[0].includes('Session already open')
    )) {
      return;
    }
    originalConsoleWarn.apply(console, args);
};

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.io = null;
    this.qrCode = null;
    this.status = 'initializing'; // initializing, scanning, connected, disconnected
    this.authPath = path.join(process.cwd(), 'auth_info_baileys');
  }

  setIO(io) {
    this.io = io;
  }

  async _updateFarmStatus(status, credentials = null) {
    const farmService = require('./farmService');
    try {
      const farms = await farmService.getFarms();
      if (farms.length > 0) {
        const primaryFarm = farms[0];
        await farmService.updateFarmConnection(
          primaryFarm.id,
          'whatsapp',
          status,
          credentials || {}
        );
        logger.info(`Farm connection status updated to ${status}`, { farmId: primaryFarm.id });
      }
    } catch (err) {
      logger.error('Failed to update farm connection status', { error: err.message, status });
    }
  }

  async init() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    this.sock = makeWASocket({
      auth: state,
      // Removed deprecated printQRInTerminal: true,
      logger: require('pino')({ level: 'silent' }),
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = 'scanning';
        try {
          // Add error correction level and scale for better scan readability
          this.qrCode = await qrcode.toDataURL(qr, { 
            errorCorrectionLevel: 'H',
            margin: 2,
            scale: 10
          });
          if (this.io) {
            this.io.emit('whatsapp_qr', this.qrCode);
            this.io.emit('whatsapp_status', this.status);
          }
        } catch (err) {
          logger.error('Failed to generate QR code', { error: err.message });
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;
        
        this.status = 'disconnected';
        if (this.io) {
          this.io.emit('whatsapp_status', this.status);
        }

        // Update database status
        await this._updateFarmStatus('disconnected', null);

        if (shouldReconnect) {
          logger.info('WhatsApp connection closed. Reconnecting...');
          setTimeout(() => this.init(), 5000);
        } else {
          logger.info('WhatsApp logged out. Deleting session...');
          if (fs.existsSync(this.authPath)) {
            fs.rmSync(this.authPath, { recursive: true, force: true });
          }
          this.init();
        }
      } else if (connection === 'open') {
        this.status = 'connected';
        this.qrCode = null;
        logger.info('WhatsApp connection opened');
        
        // Update Farm WhatsApp Connection Details
        await this._updateFarmStatus('connected', this.sock?.user);

        if (this.io) {
          this.io.emit('whatsapp_status', this.status);
          this.io.emit('whatsapp_qr', null);
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (upsert) => {
      const { messages, type } = upsert;
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            const remoteJid = msg.key.remoteJid;
            const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
            
            if (textContent) {
              logger.info(`📩 Received from ${remoteJid}: ${textContent}`);
              
              try {
                // AI-powered auto-reply
                const reply = await aiService.generateResponse(textContent, [], {
                  conversationId: remoteJid,
                });
                await this.sendMessage(remoteJid, reply);
              } catch (error) {
                logger.error('Failed to send AI auto-reply', { error: error.message });
              }
            }
          }
        }
      }
    });
  }

  async sendMessage(to, message) {
    if (this.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }

    // Process the "to" number to ensure it's a valid JID
    let jid = to;
    if (!jid.includes('@')) {
      // Remove any non-numeric characters
      const cleaned = jid.replace(/\D/g, '');
      if (cleaned.length < 10) {
        throw new Error(`Invalid phone number: ${to}. Please include country code.`);
      }
      jid = `${cleaned}@s.whatsapp.net`;
    }

    logger.info(`📤 Sending to ${jid}: ${message}`);
    
    try {
      const result = await this.sock.sendMessage(jid, { text: message });
      return result;
    } catch (error) {
      logger.error('Error in Baileys sendMessage', { error: error.message, to: jid });
      throw error;
    }
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qrCode,
    };
  }

  async logout() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        logger.warn('Error during socket logout', { error: err.message });
      }
      
      if (fs.existsSync(this.authPath)) {
        fs.rmSync(this.authPath, { recursive: true, force: true });
      }
      
      this.status = 'disconnected';
      await this._updateFarmStatus('disconnected', null);

      if (this.io) {
        this.io.emit('whatsapp_status', this.status);
      }
    }
  }
}

module.exports = new WhatsAppService();
