const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const response = {
    error: err.message || 'Internal server error',
  };
  if (err.details) {
    response.details = err.details;
  }
  logger.error('Unhandled error', { status, stack: err.stack });
  res.status(status).json(response);
};
