const { z } = require('zod');

const aiQuerySchema = z.object({
  question: z.string().trim().min(5).max(500),
  farm_id: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  session_id: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9:_-]+$/)
    .max(120)
    .optional(),
});

module.exports = {
  aiQuerySchema,
};
