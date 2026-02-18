const { ZodError } = require('zod');
const logger = require('../utils/logger');

module.exports = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse(req.body);
    req.validatedBody = parsed;
    return next();
  } catch (err) {
    if (err instanceof ZodError) {
      logger.warn('Validation failed', { errors: err.errors });
      return res.status(400).json({
        error: 'Invalid payload',
        details: err.errors,
      });
    }
    next(err);
  }
};
