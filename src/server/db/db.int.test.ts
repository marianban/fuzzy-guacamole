// @vitest-environment node

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { GenerationEvent } from '../../shared/generations.js';
import { buildServer } from '../http/server-app.js';
import { createGenerationEventBus } from '../generations/events.js';
import { createPostgresGenerationStore } from '../generations/postgres-store.js';
import { createGenerationProcessor } from '../generations/processor.js';
import { createGenerationTelemetry } from '../generations/telemetry.js';
import { createGenerationWorker } from '../generations/worker.js';
import { createBuildServerOptions } from '../test-support/build-server-options.js';
import { buildMultipartPayload } from '../test-support/multipart-fixtures.js';
import {
  createBasicImg2ImgTestCatalog as createTestCatalog,
  createExecutionTestCatalog
} from '../test-support/preset-catalog-fixtures.js';
import {
  loadExecutionTestConfig,
  loadTestConfig
} from '../test-support/test-app-config.js';
import { createTestDatabaseContext } from './test-database-context.js';

function buildTestServer(options: Parameters<typeof createBuildServerOptions>[0]) {
  return buildServer(createBuildServerOptions(options));
}

describe('postgres-backed generations', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  test('given_fresh_schema_when_running_migrations_twice_then_generation_store_is_ready', async () => {
    const testDatabase = await createTestDatabaseContext();

    try {
      await testDatabase.migrate();
      await testDatabase.migrate();

      const database = testDatabase.createAppDatabase();
      try {
        const store = createPostgresGenerationStore(database);
        await expect(store.list()).resolves.toEqual([]);
      } finally {
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_postgres_store_when_creating_saving_and_deleting_then_generation_lifecycle_is_persisted', async () => {
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      try {
        const store = createPostgresGenerationStore(database);
        const first = await store.create({
          presetId: 'img2img-basic/basic',
          templateId: 'img2img-basic',
          presetParams: {
            prompt: 'first'
          }
        });
        const second = await store.create({
          presetId: 'img2img-basic/basic',
          templateId: 'img2img-basic',
          presetParams: {
            prompt: 'second'
          }
        });

        const saved = await store.save({
          ...first,
          status: 'queued',
          queuedAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z'
        });

        expect(saved.status).toBe('queued');
        await expect(store.getById(first.id)).resolves.toMatchObject({
          id: first.id,
          status: 'queued',
          queuedAt: '2026-04-02T10:00:00.000Z'
        });
        await expect(store.list()).resolves.toMatchObject([
          { id: second.id },
          { id: first.id }
        ]);

        await expect(store.delete(first.id)).resolves.toBe(true);
        await expect(store.getById(first.id)).resolves.toBeUndefined();
      } finally {
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_rebuilt_then_created_generation_still_exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-api-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const firstDatabase = testDatabase.createAppDatabase();
      const firstApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(firstDatabase)
      });

      const createdResponse = await firstApp.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'persist me'
          }
        }
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = createdResponse.json() as { id: string };

      await firstApp.close();
      await firstDatabase.close();

      const secondDatabase = testDatabase.createAppDatabase();
      const secondApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(secondDatabase)
      });

      try {
        const detailResponse = await secondApp.inject({
          method: 'GET',
          url: `/api/generations/${created.id}`
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(detailResponse.json()).toMatchObject({
          id: created.id,
          status: 'draft',
          presetId: 'img2img-basic/basic'
        });
      } finally {
        await secondApp.close();
        await secondDatabase.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_created_with_empty_params_then_resolved_defaults_survive_rebuild', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-defaults-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createExecutionTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const firstDatabase = testDatabase.createAppDatabase();
      const firstApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(firstDatabase)
      });

      const createdResponse = await firstApp.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {}
        }
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = createdResponse.json() as { id: string };

      await firstApp.close();
      await firstDatabase.close();

      const secondDatabase = testDatabase.createAppDatabase();
      const secondApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(secondDatabase)
      });

      try {
        const detailResponse = await secondApp.inject({
          method: 'GET',
          url: `/api/generations/${created.id}`
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(detailResponse.json()).toMatchObject({
          id: created.id,
          presetParams: {
            prompt: 'default prompt',
            steps: 5,
            seedMode: 'random'
          }
        });
      } finally {
        await secondApp.close();
        await secondDatabase.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_terminal_generation_is_patched_then_params_survive_rebuild', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-patch-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createExecutionTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const firstDatabase = testDatabase.createAppDatabase();
      const firstStore = createPostgresGenerationStore(firstDatabase);
      const firstApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: firstStore
      });

      const createdResponse = await firstApp.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {
            prompt: 'before patch'
          }
        }
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = createdResponse.json() as { id: string };
      const stored = await firstStore.getById(created.id);
      expect(stored).toBeDefined();
      if (stored === undefined) {
        throw new Error(`Generation "${created.id}" was not stored before patching.`);
      }
      await firstStore.save({
        ...stored,
        status: 'completed',
        updatedAt: '2026-04-07T10:00:00.000Z'
      });

      const patchResponse = await firstApp.inject({
        method: 'PATCH',
        url: `/api/generations/${created.id}`,
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {
            prompt: 'after patch',
            steps: 7,
            seedMode: 'fixed',
            seed: 123
          }
        }
      });
      expect(patchResponse.statusCode).toBe(200);

      await firstApp.close();
      await firstDatabase.close();

      const secondDatabase = testDatabase.createAppDatabase();
      const secondApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(secondDatabase)
      });

      try {
        const detailResponse = await secondApp.inject({
          method: 'GET',
          url: `/api/generations/${created.id}`
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(detailResponse.json()).toMatchObject({
          id: created.id,
          status: 'completed',
          presetParams: {
            prompt: 'after patch',
            steps: 7,
            seedMode: 'fixed',
            seed: 123
          }
        });
      } finally {
        await secondApp.close();
        await secondDatabase.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_running_generation_lifecycle_then_contract_matches_existing_routes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-lifecycle-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      const app = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(database)
      });

      try {
        const createdResponse = await app.inject({
          method: 'POST',
          url: '/api/generations',
          payload: {
            presetId: 'img2img-basic/basic',
            presetParams: {
              prompt: 'lifecycle'
            }
          }
        });
        expect(createdResponse.statusCode).toBe(201);
        const created = createdResponse.json() as { id: string };

        const queueResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${created.id}/queue`
        });
        expect(queueResponse.statusCode).toBe(200);
        expect(queueResponse.json()).toMatchObject({
          id: created.id,
          status: 'queued'
        });

        const cancelResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${created.id}/cancel`
        });
        expect(cancelResponse.statusCode).toBe(200);
        expect(cancelResponse.json()).toMatchObject({
          id: created.id,
          status: 'canceled'
        });

        const deleteResponse = await app.inject({
          method: 'DELETE',
          url: `/api/generations/${created.id}`
        });
        expect(deleteResponse.statusCode).toBe(204);
      } finally {
        await app.close();
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_queueing_generation_then_worker_processes_it_to_a_terminal_state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-worker-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      const generationStore = createPostgresGenerationStore(database);
      const eventBus = createGenerationEventBus();
      const telemetry = createGenerationTelemetry({
        eventBus,
        now: () => new Date()
      });
      const app = buildTestServer({
        config,
        presetCatalog,
        generationStore,
        generationEventBus: eventBus,
        generationTelemetry: telemetry
      });
      const worker = createGenerationWorker({
        eventBus,
        telemetry,
        store: generationStore,
        pollIntervalMs: 60_000,
        submittedTimeoutMs: config.timeouts.submittedTimeoutMs,
        now: () => new Date(),
        processor: {
          async process() {
            return { status: 'completed' };
          }
        }
      });

      try {
        await worker.start();

        const createdResponse = await app.inject({
          method: 'POST',
          url: '/api/generations',
          payload: {
            presetId: 'img2img-basic/basic',
            presetParams: {
              prompt: 'worker lifecycle'
            }
          }
        });
        expect(createdResponse.statusCode).toBe(201);
        const created = createdResponse.json() as { id: string };

        const queueResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${created.id}/queue`
        });
        expect(queueResponse.statusCode).toBe(200);

        await expectGenerationStatus(generationStore, created.id, 'completed');
      } finally {
        await worker.stop();
        await app.close();
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_generation_executes_then_event_bus_orders_upserts_and_telemetry_for_one_run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-sse-worker-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      const generationStore = createPostgresGenerationStore(database);
      const eventBus = createGenerationEventBus();
      const telemetry = createGenerationTelemetry({
        eventBus,
        now: () => new Date('2026-04-07T10:20:21.000Z')
      });
      const app = buildTestServer({
        config,
        presetCatalog,
        generationStore,
        generationEventBus: eventBus,
        generationTelemetry: telemetry
      });
      const events: GenerationEvent[] = [];
      const unsubscribe = eventBus.subscribe((event) => {
        events.push(event);
      });
      const worker = createGenerationWorker({
        eventBus,
        telemetry,
        store: generationStore,
        pollIntervalMs: 10,
        submittedTimeoutMs: config.timeouts.submittedTimeoutMs,
        now: () => new Date('2026-04-07T10:20:21.000Z'),
        processor: {
          async process() {
            return { status: 'completed' };
          }
        }
      });

      try {
        await worker.start();
        const createdResponse = await app.inject({
          method: 'POST',
          url: '/api/generations',
          payload: {
            presetId: 'img2img-basic/basic',
            presetParams: {
              prompt: 'sse ordering'
            }
          }
        });
        expect(createdResponse.statusCode).toBe(201);
        const created = createdResponse.json() as { id: string };

        events.length = 0;

        const queueResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${created.id}/queue`
        });
        expect(queueResponse.statusCode).toBe(200);

        await expectGenerationStatus(generationStore, created.id, 'completed');

        const generationEvents = events.filter(
          (event) => event.generationId === created.id
        );

        expect(generationEvents.map((event) => summarizeGenerationEvent(event))).toEqual([
          'upsert:queued',
          'telemetry:queued',
          'upsert:submitted',
          'telemetry:submitted',
          'upsert:completed',
          'telemetry:completed'
        ]);

        const runIds = generationEvents
          .filter(
            (
              event
            ): event is Extract<
              (typeof generationEvents)[number],
              { type: 'telemetry' }
            > => event.type === 'telemetry'
          )
          .map((event) => event.runId);
        expect(new Set(runIds).size).toBe(1);
      } finally {
        unsubscribe();
        await worker.stop();
        await app.close();
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_real_processor_with_postgres_store_when_queueing_generation_then_prompt_metadata_and_output_are_persisted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-real-worker-'));
    tempDirs.push(root);
    const config = await loadExecutionTestConfig(root);
    const presetCatalog = createExecutionTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      const generationStore = createPostgresGenerationStore(database);
      const eventBus = createGenerationEventBus();
      const telemetry = createGenerationTelemetry({
        eventBus,
        now: () => new Date('2026-04-07T10:20:21.000Z')
      });
      const app = buildTestServer({
        config,
        presetCatalog,
        generationStore,
        generationEventBus: eventBus,
        generationTelemetry: telemetry
      });
      const processor = createGenerationProcessor({
        store: generationStore,
        telemetry,
        comfyClient: {
          uploadInputImage: vi.fn(async () => {
            throw new Error('should not upload txt2img input');
          }),
          submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
          pollHistory: vi.fn(async () => ({
            history: {
              'prompt-1': {
                outputs: {
                  '3': {
                    images: [
                      {
                        filename: 'remote.png',
                        subfolder: 'output',
                        type: 'output'
                      }
                    ]
                  }
                }
              }
            },
            entry: {
              outputs: {
                '3': {
                  images: [
                    {
                      filename: 'remote.png',
                      subfolder: 'output',
                      type: 'output'
                    }
                  ]
                }
              }
            }
          })),
          downloadImage: vi.fn(async () => Buffer.from([7, 8, 9]))
        },
        config,
        now: () => new Date('2026-04-07T10:20:21.000Z')
      });
      const worker = createGenerationWorker({
        eventBus,
        telemetry,
        store: generationStore,
        pollIntervalMs: 60_000,
        submittedTimeoutMs: config.timeouts.submittedTimeoutMs,
        now: () => new Date('2026-04-07T10:20:21.000Z'),
        processor
      });

      try {
        await worker.start();

        const createdResponse = await app.inject({
          method: 'POST',
          url: '/api/generations',
          payload: {
            presetId: 'txt2img-basic/basic',
            presetParams: {
              prompt: 'db real processor',
              steps: 5,
              seedMode: 'fixed',
              seed: 123
            }
          }
        });
        expect(createdResponse.statusCode).toBe(201);
        const created = createdResponse.json() as { id: string };

        const queueResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${created.id}/queue`
        });
        expect(queueResponse.statusCode).toBe(200);

        await expectGenerationStatus(generationStore, created.id, 'completed');

        const stored = await generationStore.getStoredById(created.id);
        expect(stored?.promptRequest).toMatchObject({
          prompt: expect.any(Object)
        });
        expect(stored?.promptResponse).toMatchObject({
          promptId: 'prompt-1'
        });

        const outputDir = path.join(config.paths.outputs, created.id);
        const outputFiles = await readdir(outputDir);
        expect(outputFiles).toHaveLength(1);
        expect(outputFiles[0]).toMatch(/^2026-04-07T10-20-21-000Z-/);
        const outputBytes = await readFile(
          path.join(outputDir, outputFiles[0] ?? 'missing')
        );
        expect(outputBytes.equals(Buffer.from([7, 8, 9]))).toBe(true);
      } finally {
        await worker.stop();
        await app.close();
        await database.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_uploading_input_then_path_remains_persisted_after_restart', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-upload-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const firstDatabase = testDatabase.createAppDatabase();
      const firstApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(firstDatabase)
      });

      const createdResponse = await firstApp.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'with file'
          }
        }
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = createdResponse.json() as { id: string };

      const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const multipart = buildMultipartPayload('input.png', fileBuffer);

      const uploadResponse = await firstApp.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/input`,
        headers: {
          'content-type': `multipart/form-data; boundary=${multipart.boundary}`
        },
        payload: multipart.payload
      });
      expect(uploadResponse.statusCode).toBe(204);

      await firstApp.close();
      await firstDatabase.close();

      const secondDatabase = testDatabase.createAppDatabase();
      const secondApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: createPostgresGenerationStore(secondDatabase)
      });

      try {
        const detailResponse = await secondApp.inject({
          method: 'GET',
          url: `/api/generations/${created.id}`
        });
        expect(detailResponse.statusCode).toBe(200);
        const detail = detailResponse.json() as {
          presetParams: {
            inputImagePath: string;
          };
        };
        expect(detail.presetParams.inputImagePath).toContain(created.id);

        const savedContent = await readFile(detail.presetParams.inputImagePath);
        expect(savedContent.equals(fileBuffer)).toBe(true);
      } finally {
        await secondApp.close();
        await secondDatabase.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });

  test('given_db_backed_server_when_queueing_generation_then_execution_snapshot_remains_persisted_after_restart', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-execution-snapshot-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createExecutionTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const firstDatabase = testDatabase.createAppDatabase();
      const firstStore = createPostgresGenerationStore(firstDatabase);
      const firstApp = buildTestServer({
        config,
        presetCatalog,
        generationStore: firstStore
      });

      const createdResponse = await firstApp.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {
            prompt: 'persist snapshot',
            steps: 5,
            seedMode: 'fixed',
            seed: 123
          }
        }
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = createdResponse.json() as { id: string };

      const queueResponse = await firstApp.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(queueResponse.statusCode).toBe(200);

      await firstApp.close();
      await firstDatabase.close();

      const secondDatabase = testDatabase.createAppDatabase();
      const secondStore = createPostgresGenerationStore(secondDatabase);

      try {
        const stored = (await secondStore.getStoredById(created.id)) as
          | (Awaited<ReturnType<typeof secondStore.getStoredById>> & {
              executionSnapshot?: {
                resolvedParams?: Record<string, unknown>;
                workflow?: Record<string, unknown>;
              };
            })
          | undefined;

        expect(stored?.executionSnapshot).toMatchObject({
          resolvedParams: {
            prompt: 'persist snapshot',
            steps: 5,
            seedMode: 'fixed',
            seed: 123
          },
          workflow: {
            '7': {
              inputs: {
                seed: 123,
                steps: 5
              }
            }
          }
        });
      } finally {
        await secondDatabase.close();
      }
    } finally {
      await testDatabase.dispose();
    }
  });
});

async function expectGenerationStatus(
  store: ReturnType<typeof createPostgresGenerationStore>,
  generationId: string,
  status: 'completed' | 'failed'
) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const generation = await store.getById(generationId);
    if (generation?.status === status) {
      expect(generation.updatedAt).toEqual(expect.any(String));
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(
    `Timed out waiting for generation "${generationId}" to reach status "${status}".`
  );
}

function summarizeGenerationEvent(event: GenerationEvent): string {
  if (event.type === 'upsert') {
    return `upsert:${event.generation.status}`;
  }

  if (event.type === 'telemetry') {
    if (event.telemetry.kind === 'progress') {
      return `telemetry:${event.telemetry.step}`;
    }

    return `telemetry:${event.telemetry.status ?? event.telemetry.step ?? event.telemetry.kind}`;
  }

  return `deleted:${event.generationId}`;
}
