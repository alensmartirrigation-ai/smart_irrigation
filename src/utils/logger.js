const { createLogger, format, transports } = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProd
    ? format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
    : format.combine(
        format.colorize(),
        format.timestamp(),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const base = `${timestamp} [${level}] ${message}`;
          const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return stack ? `${base} - ${stack}` : `${base}${extras}`;
        })
      ),
  transports: [new transports.Console()],
});

module.exports = logger;
