// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createInMemoryGenerationStore } from './in-memory-store.js';

describe('createInMemoryGenerationStore', () => {
  test('given_missing_execution_data_when_marking_queued_then_store_throws_clear_error', async () => {
    const store = createInMemoryGenerationStore();
    const created = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'test prompt'
      }
    });

    await expect(
      store.markQueued(created.id, {
        queuedAt: '2026-04-07T10:00:00.000Z'
      } as unknown as Parameters<typeof store.markQueued>[1])
    ).rejects.toThrow(/presetParams.*required/i);
  });

  test('given_saved_public_generation_when_loading_stored_generation_then_prompt_metadata_is_preserved', async () => {
    const store = createInMemoryGenerationStore();
    const created = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'test prompt'
      }
    });

    const queued = await store.markQueued(created.id, {
      queuedAt: '2026-04-07T10:00:00.000Z',
      presetParams: {
        prompt: 'test prompt',
        seedMode: 'random',
        seed: 42
      },
      executionSnapshot: {
        workflow: {
          '7': {
            inputs: {
              seed: 42
            }
          }
        },
        resolvedParams: {
          prompt: 'test prompt',
          seedMode: 'random',
          seed: 42
        }
      }
    });
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
