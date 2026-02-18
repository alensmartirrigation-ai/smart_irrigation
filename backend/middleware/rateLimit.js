const logger = require('../utils/logger');

const createRateLimiter = ({ windowMs, maxRequests, keyGenerator }) => {
  const windowSize = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const max = Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 10;
  const getKey = typeof keyGenerator === 'function' ? keyGenerator : (req) => req.ip || 'unknown';
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = getKey(req);
    const existing = store.get(key);

    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowSize });
      return next();
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      logger.warn('Rate limit exceeded', { key, path: req.originalUrl, retryAfterSec });
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after_seconds: retryAfterSec,
      });
    }

    existing.count += 1;
    return next();
  };
};

module.exports = {
  createRateLimiter,
};
