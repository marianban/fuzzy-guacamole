import { z } from 'zod';

import { generationTelemetrySourceValues } from './generation-telemetry.js';

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

export const updateGenerationRequestSchema = z.object({
  presetId: z.string().min(1),
  presetParams: z.record(z.string(), z.unknown())
});

export const generationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('upsert'),
    generationId: z.uuid(),
    generation: generationSchema
  }),
  z.object({
    type: z.literal('telemetry'),
    generationId: z.uuid(),
    runId: z.uuid(),
    sequence: z.int().positive(),
    occurredAt: z.iso.datetime(),
    telemetry: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('milestone'),
          source: z.enum(generationTelemetrySourceValues),
          status: generationStatusSchema.optional(),
          step: z.string().min(1).optional(),
          message: z.string().min(1).optional(),
          details: z.record(z.string(), z.unknown()).optional()
        })
        .refine((value) => value.status !== undefined || value.step !== undefined, {
          message: 'Milestone telemetry must include status or step.'
        }),
      z.object({
        kind: z.literal('progress'),
        source: z.enum(generationTelemetrySourceValues),
        step: z.string().min(1),
        message: z.string().min(1).optional(),
        current: z.int().nonnegative().optional(),
        total: z.int().positive().optional(),
        elapsedMs: z.int().nonnegative().optional(),
        details: z.record(z.string(), z.unknown()).optional()
      }),
      z.object({
        kind: z.literal('log'),
        source: z.enum(generationTelemetrySourceValues),
        level: z.enum(['info', 'warn', 'error']),
        message: z.string().min(1),
        status: generationStatusSchema.optional(),
        step: z.string().min(1).optional(),
        details: z.record(z.string(), z.unknown()).optional()
      })
    ])
  }),
  z
    .object({
      type: z.literal('deleted'),
      generationId: z.uuid()
    })
    .strict()
]);

export type Generation = z.infer<typeof generationSchema>;
export type GenerationStatus = z.infer<typeof generationStatusSchema>;
export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;
export type UpdateGenerationRequest = z.infer<typeof updateGenerationRequestSchema>;
export type GenerationEvent = z.infer<typeof generationEventSchema>;
