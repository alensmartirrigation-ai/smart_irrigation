const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const aiService = require('./ai.service');
const { Farm } = require('../models');

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

class SessionManager {
  constructor() {
    this.sessions = new Map(); // Map<farmId, SessionInstance>
    this.io = null;
    this.baseAuthPath = path.join(process.cwd(), 'auth_info_baileys');
  }

  setIO(io) {
    this.io = io;
  }

  async initAll() {
      try {
          const farms = await Farm.findAll();
          for (const farm of farms) {
              await this.init(farm.id);
          }
      } catch (error) {
          logger.error('Failed to initialize all WhatsApp sessions', { error: error.message });
      }
  }

  async init(farmId) {
    if (!farmId) {
        logger.error('Cannot init WhatsApp session without farmId');
        return;
    }

    try {
        // Step 1: Fetch farm from DB
        const farm = await Farm.findByPk(farmId);
        if (!farm) {
            logger.error(`Farm ${farmId} not found during init`);
            return;
        }

        const sessionExistsInMemory = this.sessions.has(farmId);
        const session = sessionExistsInMemory ? this.sessions.get(farmId) : null;

        // Step 2: If in-memory session exists and is connected, return
        if (session && session.status === 'connected') {
            return; 
        }
        
        // If socket exists but closed/broken, destroy it first to be safe
        if (session) {
            this.sessions.delete(farmId);
        }

        // Step 3: Validate DB <-> File Consistency
        const authPath = path.join(this.baseAuthPath, farmId);
        const authExists = fs.existsSync(authPath);
        const hasSessionId = !!farm.session_id;

        let shouldStartNewSession = false;

        if (hasSessionId && authExists) {
            // Case A: Valid restore
            logger.info(`Restoring session for farm ${farmId}`);
        } else if (hasSessionId && !authExists) {
            // Case B: DB has session, but file missing (Corruption/Cleanup)
            logger.warn(`Session mismatch for farm ${farmId}: DB has ID, file missing. Resetting.`);
            await farm.update({ session_id: null, connection_status: 'disconnected' });
            shouldStartNewSession = true;
        } else if (!hasSessionId && authExists) {
            // Case C: File orphaned
            logger.warn(`Session mismatch for farm ${farmId}: File exists, DB has no ID. Cleaning up.`);
            fs.rmSync(authPath, { recursive: true, force: true });
            shouldStartNewSession = true;
        } else {
            // Case D: New session
            shouldStartNewSession = true;
        }

        // Step 4: Prepare New Session if needed
        if (shouldStartNewSession) {
            const newSessionId = uuidv4();
            await farm.update({ 
                session_id: newSessionId, 
                connection_status: 'connecting',
                auth_path: authPath 
            });
            // Ensure directory exists (mkdir handled by Baileys usually, but explicit check good)
            if (!fs.existsSync(authPath)) {
                fs.mkdirSync(authPath, { recursive: true });
            }
        } else {
             await farm.update({ connection_status: 'connecting' });
        }

        // Step 5: Start Baileys Socket
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const sock = makeWASocket({
            auth: state,
            logger: require('pino')({ level: 'silent' }),
            // Implement other Baileys configs if needed
        });

        // Store active session
        this.sessions.set(farmId, {
            sock,
            status: 'connecting',
            qrCode: null,
            createdAt: new Date()
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(farmId, update));
        sock.ev.on('messages.upsert', (upsert) => this.handleMessages(farmId, upsert));

    } catch (err) {
        logger.error(`Failed to init session for farm ${farmId}`, { error: err.message });
        // Attempt to reset DB status to clean state?
    }
  }

  async handleConnectionUpdate(farmId, update) {
      const { connection, lastDisconnect, qr } = update;
      const session = this.sessions.get(farmId);
      if (!session) return;

      try {
          const farm = await Farm.findByPk(farmId);

          if (qr) {
              session.status = 'qr_pending';
              const qrCodeData = await qrcode.toDataURL(qr, { errorCorrectionLevel: 'H', margin: 2, scale: 10 });
              session.qrCode = qrCodeData;
              
              await farm.update({ connection_status: 'qr_pending' });
              
              if (this.io) {
                  this.io.emit('whatsapp_qr', { farmId, qr: qrCodeData });
                  this.io.emit('whatsapp_status', { farmId, status: 'qr_pending' });
              }
          }

          if (connection === 'open') {
              session.status = 'connected';
              session.qrCode = null;
              
              await farm.update({ 
                  connection_status: 'connected',
                  last_connected_at: new Date()
              });

              if (this.io) {
                  this.io.emit('whatsapp_status', { farmId, status: 'connected' });
                  this.io.emit('whatsapp_qr', { farmId, qr: null });
                  this.io.emit('farm_updated', farm.toJSON());
              }
              logger.info(`WhatsApp connected for farm ${farmId}`);
          }

          if (connection === 'close') {
              const reason = lastDisconnect?.error?.output?.statusCode;
              const isLoggedOut = reason === DisconnectReason.loggedOut;
              const shouldReconnect = !isLoggedOut;

              if (isLoggedOut) {
                  logger.info(`Farm ${farmId} logged out`);
                  await this.destroySession(farmId, true); // True = clear DB session_id
              } else {
                  logger.info(`Farm ${farmId} disconnected (reason: ${reason}). Reconnecting...`);
                  session.status = 'connecting';
                  await farm.update({ connection_status: 'connecting' });
                  if (this.io) {
                      this.io.emit('whatsapp_status', { farmId, status: 'connecting' });
                      this.io.emit('farm_updated', farm.toJSON());
                  }
                  
                  // Reconnect logic: delete memory ref (but not DB/file) and re-init
                  this.sessions.delete(farmId);
                  setTimeout(() => this.init(farmId), 5000); // Backoff?
              }
          }
      } catch (err) {
          logger.error(`Error handling connection update for farm ${farmId}`, { error: err.message });
      }
  }

  async startIrrigationForDevice(deviceId, durationSeconds = 60) {
    const { startIrrigation } = require('../services/device.service');
    try {
      await startIrrigation(deviceId, durationSeconds);
    } catch (e) {
      logger.error('Failed to start irrigation via helper method', { error: e.message, deviceId });
      throw e;
    }
  }

  async handleMessages(farmId, upsert) {
    const { messages, type } = upsert;
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;

      const remoteJid = msg.key.remoteJid;
      const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
      
      if (!textContent) continue;

      logger.info(`📩 Received from ${remoteJid} for farm ${farmId}: ${textContent}`);

      // Improved command detection for pump control
      const lower = textContent.toLowerCase();
      if (lower.includes('turn on pump')) {
        const { Device } = require('../models');
        try {
          // Extract UUID if present
          const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
          const match = textContent.match(uuidRegex);
          const providedDeviceId = match ? match[0] : null;

          const devices = await Device.findAll({ where: { farm_id: farmId } });

          if (providedDeviceId) {
            const device = devices.find(d => d.id === providedDeviceId);
            if (device) {
              await this.startIrrigationForDevice(device.id);
              await this.sendMessage(farmId, remoteJid, `✅ Pump turned on for device: ${device.name || device.id}`);
            } else {
              await this.sendMessage(farmId, remoteJid, `⚠️ Device ${providedDeviceId} not found or doesn't belong to this farm.`);
            }
          } else {
            if (devices.length === 0) {
              await this.sendMessage(farmId, remoteJid, '⚠️ No devices found for this farm.');
            } else if (devices.length === 1) {
              await this.startIrrigationForDevice(devices[0].id);
              await this.sendMessage(farmId, remoteJid, `✅ Pump turned on for device: ${devices[0].name || devices[0].id}`);
            } else {
              const deviceList = devices.map(d => `- ${d.name || 'Unnamed'}: ${d.id}`).join('\n');
              await this.sendMessage(farmId, remoteJid, `Multiple devices found. Please reply with "turn on pump [ID]":\n${deviceList}`);
            }
          }
          continue; // skip AI processing for this message
        } catch (e) {
          logger.error('Failed to handle pump WhatsApp command', { error: e.message });
          await this.sendMessage(farmId, remoteJid, '⚠️ Failed to process pump command.');
          continue;
        }
      }

      // AI handling
      try {
        const reply = await aiService.generateResponse(textContent, [], { 
          conversationId: `${farmId}:${remoteJid}`, 
          farmId: farmId 
        });
        await this.sendMessage(farmId, remoteJid, reply);
      } catch (error) {
        logger.error('Failed to send AI auto-reply', { farmId, error: error.message });
      }
    }
  }

  async destroySession(farmId, clearDB = false) {
      const session = this.sessions.get(farmId);
      
      // 1. Memory Cleanup
      if (session && session.sock) {
          try {
             // Only logout if we are clearing DB (meaning explicit logout), 
             // otherwise just close socket/end for restart?
             // Actually socks should be ended if we are destroying.
             // If logged out manually by user on phone, sock is already closed.
          } catch (e) { /* ignore */ }
      }
      this.sessions.delete(farmId);

      // 2. File Cleanup
      const authPath = path.join(this.baseAuthPath, farmId);
      if (clearDB && fs.existsSync(authPath)) {
          fs.rmSync(authPath, { recursive: true, force: true });
      }

      // 3. DB Cleanup
      if (clearDB) {
          try {
              await Farm.update({ 
                  session_id: null, 
                  connection_status: 'disconnected', 
                  last_disconnect_reason: 'logged_out' 
              }, { where: { id: farmId } });
              
              const updatedFarm = await Farm.findByPk(farmId); // Fetch to get full object for emit
              
              if (this.io) {
                this.io.emit('whatsapp_status', { farmId, status: 'disconnected' });
                this.io.emit('farm_updated', updatedFarm.toJSON());
              }
          } catch (err) {
              logger.error(`Failed to update DB during destroy for farm ${farmId}`, { error: err.message });
          }
      }
  }

  async logout(farmId) {
      const session = this.sessions.get(farmId);
      if (session && session.sock) {
          try {
              await session.sock.logout(); // This triggers 'close' event
          } catch (err) {
              logger.warn('Error during socket logout', { farmId, error: err.message });
          }
      }
      
      // Force Clean locally (idempotent, handles race with event listener)
      await this.destroySession(farmId, true);
      
      // Re-init to allow new scan immediately
      this.init(farmId);
  }

  getStatus(farmId) {
      if (!farmId) return { status: 'initializing', qr: null };
      const session = this.sessions.get(farmId);
      if (!session) return { status: 'disconnected', qr: null };
      return { status: session.status, qr: session.qrCode };
  }
  
  async sendMessage(farmId, to, message) {
     const session = this.sessions.get(farmId);
     if (!session || session.status !== 'connected') throw new Error(`WhatsApp not connected for farm ${farmId}`);
     
     let jid = to;
     if (!jid.includes('@')) {
       const cleaned = jid.replace(/\D/g, '');
       if (cleaned.length < 10) throw new Error(`Invalid phone number: ${to}`);
       jid = `${cleaned}@s.whatsapp.net`;
     }
     
     try {
       return await session.sock.sendMessage(jid, { text: message });
     } catch (error) {
       logger.error('Error sending message', { farmId, error: error.message });
       throw error;
     }
  }
}

module.exports = new SessionManager();
