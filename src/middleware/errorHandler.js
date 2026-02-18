const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const isServerError = status >= 500;

  const payload = {
    error: isServerError ? 'Internal server error' : err.message || 'Request failed',
  };

  if (!isServerError && err.details) {
    payload.details = err.details;
  }

  logger.error('Unhandled error', {
    status,
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  res.status(status).json(payload);
};
