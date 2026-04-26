// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';

import type { Generation } from '../../shared/generations.js';
import type { AppDatabase } from '../db/client.js';
import { createPostgresGenerationStore } from './postgres-store.js';

describe('createPostgresGenerationStore', () => {
  test('given_insert_conflict_when_saving_missing_generation_then_save_uses_atomic_upsert', async () => {
    let usedOnConflict = false;
    const generation = createGeneration();

    const database = {
      db: {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    limit: async () => []
                  };
                }
              };
            }
          };
        },
        update() {
          return {
            set() {
              return {
                where() {
                  return {
                    returning: async () => []
                  };
                }
              };
            }
          };
        },
        insert() {
          return {
            values() {
              return {
                onConflictDoUpdate() {
                  usedOnConflict = true;
                  return {
                    returning: async () => [createGenerationRow(generation)]
                  };
                },
                returning: async () => {
                  throw new Error(
                    'duplicate key value violates unique constraint "generations_pkey"'
                  );
                }
              };
            }
          };
        }
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(store.save(generation)).resolves.toEqual(generation);
    expect(usedOnConflict).toBe(true);
  });

  test('given_invalid_status_in_database_when_loading_generation_then_store_rejects_the_row', async () => {
    const generation = createGeneration();
    const invalidRow = createGenerationRow({
      ...generation,
      status: 'corrupt'
    });

    const database = {
      db: {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    limit: async () => [invalidRow]
                  };
                }
              };
            }
          };
        }
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(store.getById(generation.id)).rejects.toThrow();
  });

  test('given_submitted_generation_when_recording_prompt_metadata_then_store_round_trips_it_and_delete_stays_guarded', async () => {
    const generation = createGeneration({
      status: 'submitted'
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          createGenerationRow({
            ...generation,
            promptRequest: { prompt: { '3': { class_type: 'SaveImage' } } }
          })
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          createGenerationRow({
            ...generation,
            promptRequest: { prompt: { '3': { class_type: 'SaveImage' } } },
            promptResponse: { promptId: 'prompt-1' }
          })
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      store.recordPromptRequest(generation.id, {
        prompt: { '3': { class_type: 'SaveImage' } }
      })
    ).resolves.toMatchObject({
      promptRequest: { prompt: { '3': { class_type: 'SaveImage' } } }
    });
    await expect(
      store.recordPromptResponse(generation.id, {
        promptId: 'prompt-1'
      })
    ).resolves.toMatchObject({
      promptResponse: { promptId: 'prompt-1' }
    });
    await expect(store.deleteDeletable(generation.id)).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  test('given_non_serializable_prompt_metadata_when_recording_then_store_throws_clear_error', async () => {
    const generation = createGeneration({
      status: 'submitted'
    });
    const database = {
      db: {
        execute: vi.fn()
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      store.recordPromptRequest(generation.id, {
        count: 1n
      })
    ).rejects.toThrow(/prompt request metadata.*json-serializable/i);
    await expect(
      store.recordPromptResponse(generation.id, {
        count: 1n
      })
    ).rejects.toThrow(/prompt response metadata.*json-serializable/i);
  });

  test('given_completed_generation_when_marking_queued_with_normalized_params_then_store_resets_prompt_metadata_and_persists_params', async () => {
    const generation = createGeneration({
      status: 'completed',
      presetParams: {
        prompt: 'test prompt'
      },
      error: 'previous failure'
    });
    const execute = vi.fn().mockResolvedValue({
      rows: [
        createGenerationRow({
          ...generation,
          status: 'queued',
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
          },
          promptRequest: null,
          promptResponse: null,
          queuedAt: '2026-04-07T10:00:30.000Z',
          updatedAt: '2026-04-07T10:00:30.000Z',
          error: null
        })
      ]
    });
    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      store.markQueued(generation.id, {
        queuedAt: '2026-04-07T10:00:30.000Z',
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
      })
    ).resolves.toMatchObject({
      status: 'queued',
      presetParams: {
        prompt: 'test prompt',
        seedMode: 'random',
        seed: 42
      },
      error: null
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('given_editable_generation_when_updating_snapshot_then_store_uses_guarded_update', async () => {
    const generation = createGeneration({
      presetParams: {
        prompt: 'updated prompt',
        steps: 12
      }
    });
    const execute = vi.fn().mockResolvedValue({
      rows: [
        createGenerationRow({
          ...generation,
          presetId: 'txt2img-basic/basic',
          templateId: 'txt2img-basic'
        })
      ]
    });
    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      (
        store as typeof store & {
          updateEditableGeneration?: (
            generationId: string,
            input: {
              presetId: string;
              templateId: string;
              presetParams: Record<string, unknown>;
            }
          ) => ReturnType<typeof store.getById>;
        }
      ).updateEditableGeneration?.(generation.id, {
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'updated prompt',
          steps: 12
        }
      })
    ).resolves.toMatchObject({
      id: generation.id,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic',
      presetParams: {
        prompt: 'updated prompt',
        steps: 12
      }
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('given_active_generation_when_updating_snapshot_then_store_returns_undefined', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      (
        store as typeof store & {
          updateEditableGeneration?: (
            generationId: string,
            input: {
              presetId: string;
              templateId: string;
              presetParams: Record<string, unknown>;
            }
          ) => ReturnType<typeof store.getById>;
        }
      ).updateEditableGeneration?.('11111111-1111-4111-8111-111111111111', {
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: 'updated prompt'
        }
      })
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('given_missing_execution_data_when_marking_queued_then_store_fails_before_database_call', async () => {
    const execute = vi.fn();
    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      store.markQueued('11111111-1111-4111-8111-111111111111', {
        queuedAt: '2026-04-07T10:00:30.000Z'
      } as unknown as Parameters<typeof store.markQueued>[1])
    ).rejects.toThrow(/presetParams.*required/i);
    expect(execute).not.toHaveBeenCalled();
  });

  test('given_stale_submitted_generations_when_failing_before_cutoff_then_store_updates_them_in_one_database_call', async () => {
    const failedGeneration = createGeneration({
      status: 'failed',
      error: 'Generation processing timed out while waiting in submitted state.',
      updatedAt: '2026-04-07T10:00:30.000Z'
    });
    const execute = vi.fn().mockResolvedValue({
      rows: [createGenerationRow(failedGeneration)]
    });
    const database = {
      db: {
        execute
      }
    } as unknown as AppDatabase;

    const store = createPostgresGenerationStore(database);

    await expect(
      store.failStaleSubmittedBefore(
        '2026-04-07T10:00:30.000Z',
        'Generation processing timed out while waiting in submitted state.'
      )
    ).resolves.toMatchObject([failedGeneration]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

function createGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'draft',
    presetId: 'img2img-basic/basic',
    templateId: 'img2img-basic',
    presetParams: {
      prompt: 'test prompt'
    },
    queuedAt: null,
    error: null,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides
  };
}

function createGenerationRow(
  generation:
    | (Generation & {
        executionSnapshot?: Record<string, unknown> | null;
        promptRequest?: unknown | null;
        promptResponse?: unknown | null;
      })
    | (Omit<Generation, 'status'> & {
        status: string;
        executionSnapshot?: Record<string, unknown> | null;
        promptRequest?: unknown | null;
        promptResponse?: unknown | null;
      })
) {
  return {
    id: generation.id,
    status: generation.status,
    presetId: generation.presetId,
    templateId: generation.templateId,
    presetParams: generation.presetParams,
    executionSnapshot: generation.executionSnapshot ?? null,
    promptRequest: generation.promptRequest ?? null,
    promptResponse: generation.promptResponse ?? null,
    queuedAt: generation.queuedAt,
    error: generation.error,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt
  };
}
