const express = require('express');
const { queryTimeSeries } = require('../controllers/ai.controller');
const validationMiddleware = require('../middleware/validationMiddleware');
const { aiQuerySchema } = require('../validators/aiSchema');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const aiQueryRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
});

router.post('/ai/query', aiQueryRateLimiter, validationMiddleware(aiQuerySchema), queryTimeSeries);

module.exports = router;
