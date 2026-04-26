import { describe, expect, it } from 'vitest';

import * as generations from './generations.js';

const { generationEventSchema, generationSchema } = generations;

const validGeneration = generationSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'draft',
  presetId: 'img2img-basic/basic',
  templateId: 'img2img-basic',
  presetParams: {
    prompt: 'hello'
  },
  queuedAt: null,
  error: null,
  createdAt: '2026-04-02T10:00:00.000Z',
  updatedAt: '2026-04-02T10:00:00.000Z'
});

describe('generationEventSchema', () => {
  it('given_upsert_event_without_generation_when_parsed_then_validation_fails', () => {
    const result = generationEventSchema.safeParse({
      type: 'upsert',
      generationId: validGeneration.id
    });

    expect(result.success).toBe(false);
  });

  it('given_deleted_event_with_generation_when_parsed_then_validation_fails', () => {
    const result = generationEventSchema.safeParse({
      type: 'deleted',
      generationId: validGeneration.id,
      generation: validGeneration
    });

    expect(result.success).toBe(false);
  });

  it('given_valid_upsert_event_when_parsed_then_validation_succeeds', () => {
    const result = generationEventSchema.safeParse({
      type: 'upsert',
      generationId: validGeneration.id,
      generation: validGeneration
    });

    expect(result.success).toBe(true);
  });

  it('given_valid_deleted_event_when_parsed_then_validation_succeeds', () => {
    const result = generationEventSchema.safeParse({
      type: 'deleted',
      generationId: validGeneration.id
    });

    expect(result.success).toBe(true);
  });
});

describe('updateGenerationRequestSchema', () => {
  it('given_patch_body_with_preset_and_params_when_parsed_then_validation_succeeds', () => {
    const result = (
      generations as typeof generations & {
        updateGenerationRequestSchema?: typeof generations.createGenerationRequestSchema;
      }
    ).updateGenerationRequestSchema?.safeParse({
      presetId: 'img2img-basic/basic',
      presetParams: {
        prompt: 'hello'
      }
    });

    expect(result?.success).toBe(true);
  });

  it('given_patch_body_missing_params_when_parsed_then_validation_fails', () => {
    const result = (
      generations as typeof generations & {
        updateGenerationRequestSchema?: typeof generations.createGenerationRequestSchema;
      }
    ).updateGenerationRequestSchema?.safeParse({
      presetId: 'img2img-basic/basic'
    });

    expect(result?.success).toBe(false);
  });
});
