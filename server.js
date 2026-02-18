require('dotenv').config();

const express = require('express');
const expressWinston = require('express-winston');
const {
  influxWriteApi,
} = require('./src/config/influxClient');
const logger = require('./src/utils/logger');
const sensorRoutes = require('./src/routes/sensor.routes');
const farmRoutes = require('./src/routes/farm.routes');
const irrigationRoutes = require('./src/routes/irrigation.routes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  expressWinston.logger({
    winstonInstance: logger,
    statusLevels: true,
    meta: true,
    expressFormat: true,
    colorize: false,
    msg: '{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  })
);

app.use('/api', sensorRoutes);
app.use('/api', farmRoutes);
app.use('/api', irrigationRoutes);

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.use(
  expressWinston.errorLogger({
    winstonInstance: logger,
  })
);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  logger.info('Server listening', { port: PORT });
});

const shutdown = () => {
  logger.info('Graceful shutdown initiated');
  influxWriteApi
    .close()
    .catch((err) => logger.error('Failed to close InfluxDB write API', { err }));
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', error);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});
