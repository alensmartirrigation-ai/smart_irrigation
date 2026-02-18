const express = require('express');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');
const sensorRoutes = require('./routes/sensor.routes');
const farmRoutes = require('./routes/farm.routes');
const irrigationRoutes = require('./routes/irrigation.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const userRoutes = require('./routes/user.routes');
const aiRoutes = require('./routes/ai.routes');
const errorHandler = require('./middleware/errorHandler');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, '../public')));

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

app.use('/api', sensorRoutes);
app.use('/api', farmRoutes);
app.use('/api', irrigationRoutes);
app.use('/api', whatsappRoutes);
app.use('/api', userRoutes);
app.use('/api', aiRoutes);

// SPA Fallback: Serve index.html for any other GET request (client-side routing)
app.get('*', (req, res) => {
  const indexFile = path.resolve(__dirname, '../public', 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) {
        logger.error('Failed to serve index.html', { path: indexFile, error: err.message });
        res.status(500).send('Error loading application');
    }
  });
});

app.use(
  expressWinston.errorLogger({
    winstonInstance: logger,
  })
);

app.use(errorHandler);

module.exports = app;
