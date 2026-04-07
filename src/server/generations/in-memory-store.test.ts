// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createInMemoryGenerationStore } from './in-memory-store.js';

describe('createInMemoryGenerationStore', () => {
  test('given_saved_public_generation_when_loading_stored_generation_then_prompt_metadata_is_preserved', async () => {
    const store = createInMemoryGenerationStore();
    const created = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'test prompt'
      }
    });

    const queued = await store.markQueued(created.id, '2026-04-07T10:00:00.000Z');
    expect(queued).toBeDefined();

    const claimed = await store.claimNextQueued();
    expect(claimed).toBeDefined();

    await expect(
      store.recordPromptRequest(created.id, {
        prompt: { '3': { class_type: 'SaveImage' } }
      })
    ).resolves.toMatchObject({
      promptRequest: { prompt: { '3': { class_type: 'SaveImage' } } }
    });

    await expect(
      store.save({
        ...created,
        status: 'submitted',
        queuedAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:05:00.000Z'
      })
    ).resolves.toMatchObject({
      id: created.id,
      status: 'submitted'
    });

    await expect(store.getStoredById(created.id)).resolves.toMatchObject({
      promptRequest: { prompt: { '3': { class_type: 'SaveImage' } } },
      promptResponse: null
    });
  });
});