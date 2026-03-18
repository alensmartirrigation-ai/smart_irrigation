const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrService = require('./qr.service');
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
    this.sessions = new Map(); // Map<farmIdKey, SessionInstance>
    this.pendingInit = new Set(); // farmId keys currently being inited
    this.reconnectTimeouts = new Map(); // farmIdKey -> timeoutId (single scheduled reconnect per farm)
    this._closePending = new Set(); // farmId keys with a close handler queued via setImmediate
    this._socketIdCounter = 0; // monotonic counter to tag each socket so stale events are ignored
    this.io = null;
    this.baseAuthPath = path.join(process.cwd(), 'auth_info_baileys');
  }

  _key(farmId) {
    return farmId == null ? null : String(farmId);
  }

  setIO(io) {
    this.io = io;
  }

  scheduleReconnect(farmId, delayMs) {
    const key = this._key(farmId);
    const existing = this.reconnectTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.reconnectTimeouts.delete(key);
    }
    const timeoutId = setTimeout(() => {
      this.reconnectTimeouts.delete(key);
      this.init(farmId);
    }, delayMs);
    this.reconnectTimeouts.set(key, timeoutId);
  }

  async initAll() {
      try {
          const farms = await Farm.findAll();
          // Only restore sessions that were previously connected (have session_id).
          // Disconnected farms are inited on demand when getStatus is called (lazy init),
          // so we get a single fresh connection and QR instead of opening many at startup.
          for (const farm of farms) {
              if (farm.session_id) {
                  await this.init(farm.id);
              }
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

    const key = this._key(farmId);
    if (this.pendingInit.has(key)) return;
    this.pendingInit.add(key);

    try {
        // Step 1: Fetch farm from DB
        const farm = await Farm.findByPk(farmId);
        if (!farm) {
            logger.error(`Farm ${farmId} not found during init`);
            return;
        }

        const sessionExistsInMemory = this.sessions.has(key);
        const session = sessionExistsInMemory ? this.sessions.get(key) : null;

        // Step 2: If in-memory session exists and is connected, return
        if (session && session.status === 'connected') {
            return; 
        }
        
        // If socket exists but closed/broken, destroy it first to be safe
        if (session) {
            this.sessions.delete(key);
        }

        // Step 3: Validate DB <-> File Consistency
        const authPath = path.join(this.baseAuthPath, key);
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
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                logger.info(`Cleaned auth path for new session: farm ${farmId}`);
            }
            const newSessionId = uuidv4();
            await farm.update({ 
                session_id: newSessionId, 
                connection_status: 'connecting',
                auth_path: authPath 
            });
            if (!fs.existsSync(authPath)) {
                fs.mkdirSync(authPath, { recursive: true });
            }
            logger.info(`New session for farm ${farmId} - waiting for QR`);
        } else {
             await farm.update({ connection_status: 'connecting' });
        }

        // Step 5: Start Baileys Socket
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
        const { version } = await fetchLatestBaileysVersion();
        logger.info(`Using WA Web version: ${version.join('.')}`);
        const sock = makeWASocket({
            auth: state,
            logger: require('pino')({ level: 'warn' }),
            browser: Browsers.ubuntu('Chrome'),
            version,
        });

        // Store active session (key so GET ?farmId=X finds session whether X is string or number)
        const socketId = ++this._socketIdCounter;
        this.sessions.set(key, {
            sock,
            status: 'connecting',
            qrCode: null,
            createdAt: new Date(),
            _socketId: socketId
        });
        this._closePending.delete(key);

        sock.ev.on('creds.update', saveCreds);
        // Capture socketId so stale events from old sockets are ignored
        sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(farmId, update, socketId));
        sock.ev.on('messages.upsert', (upsert) => this.handleMessages(farmId, upsert));

    } catch (err) {
        logger.error(`Failed to init session for farm ${farmId}`, { error: err.message });
    } finally {
        this.pendingInit.delete(key);
    }
  }

  async handleConnectionUpdate(farmId, update, socketId) {
      const { connection, lastDisconnect, qr } = update;
      const key = this._key(farmId);
      const session = this.sessions.get(key);

      // Ignore events from stale sockets (old socket that was already destroyed/replaced)
      if (!session || session._socketId !== socketId) return;

      logger.info(`connection.update for farm ${farmId}`, { connection: connection || undefined, hasQr: !!qr, hasLastDisconnect: !!lastDisconnect });

      try {
          const farm = await Farm.findByPk(farmId);
          if (!farm) return;

          if (qr) {
              logger.info(`QR received for farm ${farmId} - emitting to clients`);
              session.status = 'qr_pending';
              try {
                  const qrPayload = typeof qr === 'string' ? qr : String(qr);
                  const qrCodeData = await qrService.toDataURL(qrPayload);
                  session.qrCode = qrCodeData;

                  await farm.update({ connection_status: 'qr_pending' });

                  if (this.io) {
                      this.io.emit('whatsapp_qr', { farmId: String(farmId), qr: qrCodeData });
                      this.io.emit('whatsapp_status', { farmId: String(farmId), status: 'qr_pending' });
                  }
              } catch (qrErr) {
                  logger.error(`Failed to generate or emit QR for farm ${farmId}`, { error: qrErr.message });
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
                  this.io.emit('whatsapp_status', { farmId: String(farmId), status: 'connected' });
                  this.io.emit('whatsapp_qr', { farmId: String(farmId), qr: null });
                  this.io.emit('farm_updated', farm.toJSON());
              }
              logger.info(`WhatsApp connected for farm ${farmId}`);
          }

          if (connection === 'close') {
              const reason = lastDisconnect?.error?.output?.statusCode;
              const isLoggedOut = reason === DisconnectReason.loggedOut;
              // Treat any "session/auth invalid" or "need new pairing" as restore failed so we clear and show new QR
              const isRestoreFailed = isLoggedOut ||
                  reason === 405 ||
                  reason === 401 ||
                  reason === 408 ||
                  reason === 403 ||  // forbidden
                  reason === 411 ||  // multideviceMismatch
                  reason === 428 ||  // connectionClosed
                  reason === 440 ||  // connectionReplaced
                  reason === 500 ||  // badSession
                  reason === 515 ||  // restartRequired
                  reason === undefined;

              // Set flag SYNCHRONOUSLY so getStatus() won't race to auto-init
              this._closePending.add(key);

              const doClose = () => {
                  this._closePending.delete(key);
                  // Re-check: if a newer socket was already created, don't interfere
                  const currentSession = this.sessions.get(key);
                  if (currentSession && currentSession._socketId !== socketId) return;

                  if (isRestoreFailed) {
                      logger.info(`Farm ${farmId} session invalid (reason: ${reason}). Clearing and creating new session for QR.`);
                      this.destroySession(farmId, true).then(() => this.scheduleReconnect(farmId, 2000));
                  } else {
                      logger.info(`Farm ${farmId} disconnected (reason: ${reason}). Reconnecting...`);
                      const s = this.sessions.get(key);
                      if (s) s.status = 'connecting';
                      farm.update({ connection_status: 'connecting' }).then(() => {
                          if (this.io) {
                              this.io.emit('whatsapp_status', { farmId: String(farmId), status: 'connecting' });
                              this.io.emit('farm_updated', farm.toJSON());
                          }
                      });
                      this.sessions.delete(key);
                      this.scheduleReconnect(farmId, 5000);
                  }
              };
              setImmediate(doClose);
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

      // Some Baileys message payloads may provide the sender JID in different fields.
      const remoteJid = msg.key.remoteJidAlt || msg.key.remoteJid;
      if (!remoteJid) {
        logger.warn(`WhatsApp message missing remote JID fields for farm ${farmId}. Skipping.`);
        continue;
      }
      const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
      
      if (!textContent) continue;

      logger.info(`📩 Received from ${remoteJid} for farm ${farmId}: ${textContent}`);

      // --- AUTHENTICATION CHECK ---
      const { User } = require('../models');
      try {
        const senderPhoneRaw = remoteJid.split('@')[0];
        const cleanedSenderPhone = senderPhoneRaw.replace(/\D/g, '');
        
        const usersWithAccess = await User.findAll({ where: { farm_id: farmId } });
        const hasAccess = usersWithAccess.some(user => {
          if (!user.phone) return false;
          const cleanedDbPhone = user.phone.replace(/\D/g, '');
          // Match the last 10 digits as a reliable comparison across different country code formats (+91, 91, etc)
          const dbLast10 = cleanedDbPhone.slice(-10);
          const senderLast10 = cleanedSenderPhone.slice(-10);
          return dbLast10 === senderLast10;
        });

        if (!hasAccess) {
          logger.warn(`Unauthorized WhatsApp message from ${remoteJid} to farm ${farmId} (Ignored)`);
          continue;
        }
      } catch (authError) {
        logger.error('WhatsApp auth check failed', { error: authError.message });
        continue; // Safer to block if DB check fails
      }

      // Improved command detection for pump control
      const lower = textContent.toLowerCase();
      if (lower.includes('turn on pump')) {
        const { Device, Farm } = require('../models');
        try {
          // Extract UUID if present
          const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
          const match = textContent.match(uuidRegex);
          const providedDeviceId = match ? match[0] : null;

          // Query devices through Farm association (many-to-many via FarmDevice)
          const farm = await Farm.findByPk(farmId, {
            include: [{ model: Device }]
          });
          const devices = farm ? farm.Devices : [];

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
      const session = this.sessions.get(this._key(farmId));
      if (session?.sock) {
          try {
              session.sock.end(undefined);
          } catch (e) { /* ignore */ }
      }
      this.sessions.delete(this._key(farmId));

      // 2. File Cleanup
      const authPath = path.join(this.baseAuthPath, this._key(farmId));
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
                this.io.emit('whatsapp_status', { farmId: String(farmId), status: 'disconnected' });
                this.io.emit('farm_updated', updatedFarm.toJSON());
              }
          } catch (err) {
              logger.error(`Failed to update DB during destroy for farm ${farmId}`, { error: err.message });
          }
      }
  }

  async logout(farmId) {
      const session = this.sessions.get(this._key(farmId));
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
      const key = this._key(farmId);
      const session = this.sessions.get(key);
      if (!session) {
          // Only auto-init if no other init/reconnect/close is in progress for this farm
          if (!this.pendingInit.has(key) && !this.reconnectTimeouts.has(key) && !this._closePending.has(key)) {
              logger.info('WhatsApp getStatus: no session, triggering init', { farmId: String(farmId), key });
              this.init(farmId).catch((err) => logger.error('Auto-init from getStatus failed', { farmId: String(farmId), error: err.message }));
          }
          return { status: 'disconnected', qr: null };
      }
      return { status: session.status, qr: session.qrCode };
  }

  getDebugStatus(farmId) {
      if (!farmId) return { hasSession: false, status: null, hasQr: false, key: null };
      const key = this._key(farmId);
      const session = this.sessions.get(key);
      return {
          hasSession: !!session,
          status: session?.status ?? null,
          hasQr: !!(session?.qrCode),
          key,
          pendingInit: this.pendingInit.has(key),
          hasReconnectScheduled: this.reconnectTimeouts.has(key),
      };
  }
  
  async sendMessage(farmId, to, message) {
     const session = this.sessions.get(this._key(farmId));
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
