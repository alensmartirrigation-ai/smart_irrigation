const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const base = `${timestamp} [${level}] ${message}`;
      const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return stack ? `${base} - ${stack}` : `${base}${extras}`;
    })
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
