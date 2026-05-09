import { describe, expect, it } from 'vitest';

import {
  generationTelemetrySources,
  generationTelemetrySteps
} from '../../shared/generation-telemetry.js';
import { createGenerationEventBus } from './events.js';
import { createGenerationTelemetry } from './telemetry.js';

describe('createGenerationTelemetry', () => {
  it('given_progress_options_with_transport_or_undefined_fields_when_published_then_payload_omits_them', () => {
    const eventBus = createGenerationEventBus();
    const telemetry = createGenerationTelemetry({
      eventBus,
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });

    const event = telemetry.publishProgress({
      generationId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-04-07T10:16:00.000Z',
      source: generationTelemetrySources.comfy,
      step: generationTelemetrySteps.waitingForHistory,
      message: undefined,
      current: 1,
      total: undefined,
      elapsedMs: 250,
      details: undefined
    });

    expect(event.telemetry).toEqual({
      kind: 'progress',
      source: generationTelemetrySources.comfy,
      step: generationTelemetrySteps.waitingForHistory,
      current: 1,
      elapsedMs: 250
    });
    expect('generationId' in event.telemetry).toBe(false);
    expect('occurredAt' in event.telemetry).toBe(false);
    expect('message' in event.telemetry).toBe(false);
    expect('total' in event.telemetry).toBe(false);
    expect('details' in event.telemetry).toBe(false);
  });
});
