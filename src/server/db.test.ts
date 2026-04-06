// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { createPostgresGenerationStore } from './generations/store.js';
import { createPresetCatalog } from './presets.js';
import { createTestDatabaseContext } from './test-database.js';

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
