// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createDraftStoredGeneration } from './stored-generation.js';

describe('createDraftStoredGeneration', () => {
  test('given_create_input_and_identity_values_when_building_draft_then_store_defaults_are_applied', () => {
    const generation = createDraftStoredGeneration(
      {
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: 'test prompt'
        }
      },
      {
        id: '11111111-1111-4111-8111-111111111111',
        timestamp: '2026-05-03T12:00:00.000Z'
      }
    );

    expect(generation).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'draft',
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'test prompt'
      },
      executionSnapshot: null,
      promptRequest: null,
      promptResponse: null,
      queuedAt: null,
      error: null,
      createdAt: '2026-05-03T12:00:00.000Z',
      updatedAt: '2026-05-03T12:00:00.000Z'
    });
  });
});
