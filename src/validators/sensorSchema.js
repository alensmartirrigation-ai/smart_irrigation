const { z } = require('zod');

const timestampSchema = z
  .preprocess((value) => {
    if (value == null || value === '') return undefined;
    if (typeof value === 'number' || typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return value;
  }, z.date())
  .optional();

const sensorSchema = z.object({
  farm_id: z.string().trim().min(1),
  sensor_id: z.string().trim().min(1),
  temperature: z.number(),
  humidity: z.number(),
  soil_moisture: z.number(),
  timestamp: timestampSchema,
});

const sensorBatchSchema = z.object({
  readings: z.array(sensorSchema).min(1),
});

const sensorPayloadSchema = z.union([sensorSchema, sensorBatchSchema]);

module.exports = { sensorSchema, sensorPayloadSchema };
