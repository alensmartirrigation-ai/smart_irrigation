const express = require('express');
const expressWinston = require('express-winston');
const logger = require('../app/utils/logger');
const sensorRoutes = require('./routes/sensor.routes');
const farmRoutes = require('./routes/farm.routes');
const irrigationRoutes = require('./routes/irrigation.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const errorHandler = require('./middleware/errorHandler');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, '../../public')));

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  expressWinston.logger({
    winstonInstance: logger,
    statusLevels: true,
    meta: false,
    expressFormat: true,
    colorize: false,
    msg: '{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  })
);

app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'live' });
});

app.get('/health/ready', (req, res) => {
  res.status(200).json({ status: 'ready' });
});

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', sensorRoutes);
app.use('/api', farmRoutes);
app.use('/api', irrigationRoutes);
app.use('/api', whatsappRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(
  expressWinston.errorLogger({
    winstonInstance: logger,
  })
);

app.use(errorHandler);

module.exports = app;
