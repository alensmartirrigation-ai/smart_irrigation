const { z } = require('zod');

const irrigationPayloadSchema = z.object({
  farm_id: z.string().trim().min(1),
  duration_minutes: z.coerce.number().positive(),
  timestamp: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

const irrigationLogPayloadSchema = z.object({
  device_id: z.string().trim().min(1),
  farm_id: z.string().trim().min(1),
  timestamp: z.coerce.number(), // Unix timestamp (seconds)
});

module.exports = {
  irrigationPayloadSchema,
  irrigationLogPayloadSchema,
};
