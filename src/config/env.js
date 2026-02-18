const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().min(1).default('info'),
  API_BASE_URL: z.string().url().optional(),
  INFLUX_URL: z.string().url(),
  INFLUX_TOKEN: z.string().min(1),
  INFLUX_ORG: z.string().min(1),
  INFLUX_BUCKET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  DEFAULT_FARM_ID: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

module.exports = parsed.data;
