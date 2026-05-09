import { describe, expect, it } from 'vitest';

import {
  generationTelemetrySources,
  generationTelemetrySteps
} from './generation-telemetry.js';

describe('generationTelemetry contract constants', () => {
  it('given_known_sources_and_steps_when_referenced_then_constants_expose_stable_names', () => {
    expect(generationTelemetrySources).toEqual({
      api: 'api',
      worker: 'worker',
      processor: 'processor',
      comfy: 'comfy'
    });
    expect(generationTelemetrySteps).toEqual({
      promptRequestRecorded: 'prompt-request-recorded',
      promptSubmitted: 'prompt-submitted',
      waitingForHistory: 'waiting-for-history',
      outputStored: 'output-stored'
    });
  });
});
