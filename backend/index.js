const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const env = require('./config/env');
const { influxWriteApi } = require('./config/influxClient');
const { Server } = require('socket.io');
const whatsappService = require('./services/whatsapp.service');
const farmService = require('./services/farmService');
const userService = require('./services/userService');
const logger = require('./utils/logger');
const { sequelize } = require('./models');

const server = app.listen(env.PORT, async () => {
  logger.info('Server listening', { port: env.PORT, env: env.NODE_ENV });
  
  try {
    await sequelize.sync();
    logger.info('Database synced');
  } catch (err) {
    logger.error('Database sync failed', { error: err.message });
  }
  
  // Initialize Socket.io
  const io = new Server(server, {
    cors: {
      origin: '*',
    }
  });

  whatsappService.setIO(io);
  farmService.setIO(io);
  await whatsappService.initAll();

  io.on('connection', (socket) => {
    logger.debug('New client connected');
    // We can't really emit status here without knowing which farm the client cares about.
    // Frontend will fetch status via API or socket specific listeners.
  });
});

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('Graceful shutdown initiated', { signal });

  try {
    await influxWriteApi.flush();
    await influxWriteApi.close();
  } catch (err) {
    logger.error('Failed to close InfluxDB write API', { err: err.message });
  }

  server.close((err) => {
    if (err) {
      logger.error('HTTP server close failed', { err: err.message });
      process.exit(1);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', { error: error?.message || error });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error?.message || error, stack: error?.stack });
  process.exit(1);
});
