const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

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

  async init() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: require('pino')({ level: 'silent' }),
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = 'scanning';
        this.qrCode = await qrcode.toDataURL(qr);
        if (this.io) {
          this.io.emit('whatsapp_qr', this.qrCode);
          this.io.emit('whatsapp_status', this.status);
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
        if (this.io) {
          this.io.emit('whatsapp_status', this.status);
          this.io.emit('whatsapp_qr', null);
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (m) => {
      // logger.debug('Message received', { message: m });
    });
  }

  async sendMessage(to, message) {
    if (this.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }

    // Ensure format is correct (e.g., 919876543210@s.whatsapp.net)
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    
    await this.sock.sendMessage(jid, { text: message });
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qrCode,
    };
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout();
      if (fs.existsSync(this.authPath)) {
        fs.rmSync(this.authPath, { recursive: true, force: true });
      }
      this.status = 'disconnected';
      if (this.io) {
        this.io.emit('whatsapp_status', this.status);
      }
    }
  }
}

module.exports = new WhatsAppService();
