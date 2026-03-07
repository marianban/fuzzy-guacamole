import { z } from 'zod';

export const generationStatusSchema = z.enum([
  'draft',
  'queued',
  'submitted',
  'completed',
  'failed',
  'canceled'
]);

export const generationSchema = z.object({
  id: z.uuid(),
  status: generationStatusSchema,
  presetId: z.string().min(1),
  templateId: z.string().min(1),
  presetParams: z.record(z.string(), z.unknown()),
  queuedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const generationListResponseSchema = z.array(generationSchema);

export const createGenerationRequestSchema = z.object({
  presetId: z.string().min(1),
  presetParams: z.record(z.string(), z.unknown())
});

export const generationInputUploadResponseSchema = z.object({
  inputImagePath: z.string().min(1)
});

export const generationEventSchema = z.object({
  type: z.enum(['upsert', 'deleted']),
  generation: generationSchema.optional(),
  generationId: z.uuid()
});

export type Generation = z.infer<typeof generationSchema>;
export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;
export type GenerationEvent = z.infer<typeof generationEventSchema>;
