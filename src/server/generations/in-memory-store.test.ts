// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createInMemoryGenerationStore } from './in-memory-store.js';

describe('createInMemoryGenerationStore', () => {
  test('given_editable_generation_when_updating_then_preset_template_and_params_are_replaced', async () => {
    const store = createInMemoryGenerationStore();
    const created = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'test prompt'
      }
    });

    const updated = await store.updateEditableGeneration(created.id, {
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic',
      presetParams: {
        prompt: 'updated prompt',
        steps: 12
      }
    });

    expect(updated).toMatchObject({
      id: created.id,
      status: 'draft',
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic',
      presetParams: {
        prompt: 'updated prompt',
        steps: 12
      }
    });
  });

  test('given_active_generation_when_updating_editable_snapshot_then_store_returns_undefined', async () => {
    for (const status of ['queued', 'submitted'] as const) {
      const store = createInMemoryGenerationStore();
      const created = await store.create({
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: 'test prompt'
        }
      });
      await store.save({
        ...created,
        status,
        updatedAt: '2026-04-07T10:00:00.000Z'
      });

      const updated = await store.updateEditableGeneration(created.id, {
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: 'updated prompt'
        }
      });

      expect(updated).toBeUndefined();
    }
  });

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
