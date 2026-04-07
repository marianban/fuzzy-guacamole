// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { buildServer } from '../http/server-app.js';
import { loadAppConfig } from '../config/app-config.js';
import { createGenerationEventBus } from '../generations/events.js';
import { createGenerationProcessor } from '../generations/processor.js';
import { createGenerationWorker } from '../generations/worker.js';
import { createPostgresGenerationStore } from '../generations/store.js';
import { createPresetCatalog } from '../presets/preset-catalog.js';
import { createTestDatabaseContext } from './test-database-context.js';

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
      const firstApp = buildServer({
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
      const secondApp = buildServer({
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

  test('given_db_backed_server_when_running_generation_lifecycle_then_contract_matches_existing_routes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-db-lifecycle-'));
    tempDirs.push(root);
    const config = await loadTestConfig(root);
    const presetCatalog = createTestCatalog();
    const testDatabase = await createTestDatabaseContext();
    await testDatabase.migrate();

    try {
      const database = testDatabase.createAppDatabase();
      const app = buildServer({
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
      const app = buildServer({
        config,
        presetCatalog,
        generationStore,
        generationEventBus: eventBus
      });
      const worker = createGenerationWorker({
        eventBus,
        store: generationStore,
        pollIntervalMs: 60_000,
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
      const app = buildServer({
        config,
        presetCatalog,
        generationStore,
        generationEventBus: eventBus
      });
      const processor = createGenerationProcessor({
        store: generationStore,
        presetCatalog,
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
        store: generationStore,
        pollIntervalMs: 60_000,
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
      const firstApp = buildServer({
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
      const secondApp = buildServer({
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
});

async function loadTestConfig(root: string) {
  const configPath = path.join(root, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        comfyBaseUrl: 'http://127.0.0.1:8188',
        ssh: {
          host: '127.0.0.1',
          port: 22,
          username: 'user',
          privateKeyPath: '/tmp/id'
        },
        remoteStart: {
          startComfyCommand: 'echo start'
        },
        wol: {
          mac: 'AA:BB:CC:DD:EE:FF',
          broadcast: '192.168.0.255',
          port: 9
        },
        paths: {
          presets: '/tmp/presets',
          inputs: root,
          outputs: '/tmp/outputs'
        },
        timeouts: {
          pcBootMs: 1_000,
          sshPollMs: 1_000,
          comfyBootMs: 1_000,
          healthPollMs: 1_000,
          historyPollMs: 1_000
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}

async function loadExecutionTestConfig(root: string) {
  const configPath = path.join(root, 'config.json');
  const inputsDir = path.join(root, 'inputs');
  const outputsDir = path.join(root, 'outputs');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        comfyBaseUrl: 'http://127.0.0.1:8188',
        ssh: {
          host: '127.0.0.1',
          port: 22,
          username: 'user',
          privateKeyPath: '/tmp/id'
        },
        remoteStart: {
          startComfyCommand: 'echo start'
        },
        wol: {
          mac: 'AA:BB:CC:DD:EE:FF',
          broadcast: '192.168.0.255',
          port: 9
        },
        paths: {
          presets: '/tmp/presets',
          inputs: inputsDir,
          outputs: outputsDir
        },
        timeouts: {
          pcBootMs: 1_000,
          sshPollMs: 1_000,
          comfyBootMs: 1_000,
          healthPollMs: 1_000,
          historyPollMs: 10
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}

function createTestCatalog() {
  const summary = {
    id: 'img2img-basic/basic',
    name: 'Img2Img - Basic',
    type: 'img2img' as const,
    templateId: 'img2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt'
    }
  };

  const detail = {
    ...summary,
    model: {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: 'default prompt',
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const,
            multiline: true,
            rows: 4
          }
        }
      ]
    },
    template: {
      id: 'img2img-basic',
      type: 'img2img' as const,
      workflow: {
        '1': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function createExecutionTestCatalog() {
  const summary = {
    id: 'txt2img-basic/basic',
    name: 'Txt2Img - Basic',
    type: 'txt2img' as const,
    templateId: 'txt2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt',
      steps: 5,
      seedMode: 'random'
    }
  };

  const detail = {
    ...summary,
    model: {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        },
        {
          id: 'advanced',
          label: {
            en: 'Advanced'
          },
          order: 20,
          presentation: {
            collapsible: true,
            defaultExpanded: false
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const
          }
        },
        {
          id: 'steps',
          fieldType: 'integer' as const,
          categoryId: 'advanced',
          order: 20,
          label: {
            en: 'Steps'
          },
          default: 5,
          validation: {
            required: true,
            min: 1,
            max: 100
          },
          control: {
            type: 'slider' as const,
            min: 1,
            max: 100,
            step: 1
          }
        },
        {
          id: 'seedMode',
          fieldType: 'enum' as const,
          categoryId: 'advanced',
          order: 30,
          label: {
            en: 'Seed Mode'
          },
          default: 'random',
          validation: {
            required: true
          },
          control: {
            type: 'select' as const,
            options: [
              {
                value: 'random',
                label: { en: 'Random' }
              },
              {
                value: 'fixed',
                label: { en: 'Fixed' }
              }
            ]
          }
        },
        {
          id: 'seed',
          fieldType: 'integer' as const,
          categoryId: 'advanced',
          order: 40,
          label: {
            en: 'Seed'
          },
          validation: {
            required: false,
            min: 0
          },
          visibility: {
            field: 'seedMode',
            equals: 'fixed'
          },
          control: {
            type: 'input' as const
          }
        }
      ]
    },
    template: {
      id: 'txt2img-basic',
      type: 'txt2img' as const,
      workflow: {
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}',
            steps: '{{steps}}'
          }
        },
        '3': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        }
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function buildMultipartPayload(fileName: string, fileContent: Buffer) {
  const boundary = '----fg-test-boundary';
  const start = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      'Content-Type: image/png\r\n\r\n',
    'utf8'
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    payload: Buffer.concat([start, fileContent, end])
  };
}

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
