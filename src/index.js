require('dotenv').config();

const app = require('./app');
const env = require('./config/env');
const { influxWriteApi } = require('./config/influxClient');
const logger = require('./utils/logger');

const server = app.listen(env.PORT, () => {
  logger.info('Server listening', { port: env.PORT, env: env.NODE_ENV });
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
