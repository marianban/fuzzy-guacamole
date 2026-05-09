import { describe, expect, it } from 'vitest';

import {
  generationTelemetrySources,
  generationTelemetrySteps
} from './generation-telemetry.js';
import * as generations from './generations.js';

const { generationEventSchema, generationSchema, updateGenerationRequestSchema } =
  generations;

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

  it('given_valid_status_milestone_telemetry_event_when_parsed_then_validation_succeeds', () => {
    const result = generationEventSchema.safeParse({
      type: 'telemetry',
      generationId: validGeneration.id,
      runId: '22222222-2222-4222-8222-222222222222',
      sequence: 1,
      occurredAt: '2026-04-02T10:00:01.000Z',
      telemetry: {
        kind: 'milestone',
        source: generationTelemetrySources.api,
        status: 'queued',
        message: 'Generation queued for execution.'
      }
    });

    expect(result.success).toBe(true);
  });

  it('given_valid_progress_telemetry_event_with_step_and_source_when_parsed_then_validation_succeeds', () => {
    const result = generationEventSchema.safeParse({
      type: 'telemetry',
      generationId: validGeneration.id,
      runId: '22222222-2222-4222-8222-222222222222',
      sequence: 1,
      occurredAt: '2026-04-02T10:00:01.000Z',
      telemetry: {
        kind: 'progress',
        source: generationTelemetrySources.comfy,
        step: generationTelemetrySteps.waitingForHistory,
        elapsedMs: 25,
        message: 'Still waiting for Comfy history.'
      }
    });

    expect(result.success).toBe(true);
  });

  it('given_telemetry_event_without_run_metadata_when_parsed_then_validation_fails', () => {
    const result = generationEventSchema.safeParse({
      type: 'telemetry',
      generationId: validGeneration.id,
      telemetry: {
        kind: 'log',
        source: generationTelemetrySources.processor,
        level: 'info',
        message: 'Prompt submitted.'
      }
    });

    expect(result.success).toBe(false);
  });
});

describe('updateGenerationRequestSchema', () => {
  it('given_patch_body_with_preset_and_params_when_parsed_then_validation_succeeds', () => {
    const result = updateGenerationRequestSchema.safeParse({
      presetId: 'img2img-basic/basic',
      presetParams: {
        prompt: 'hello'
      }
    });

    expect(result?.success).toBe(true);
  });

  it('given_patch_body_missing_params_when_parsed_then_validation_fails', () => {
    const result = updateGenerationRequestSchema.safeParse({
      presetId: 'img2img-basic/basic'
    });

    expect(result.success).toBe(false);
  });

  it('given_patch_body_with_empty_preset_id_when_parsed_then_validation_fails', () => {
    const result = updateGenerationRequestSchema.safeParse({
      presetId: '',
      presetParams: {}
    });

    expect(result.success).toBe(false);
  });
});
