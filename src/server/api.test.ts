// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import type { BuildServerOptions } from './app.js';
import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { createPresetCatalog } from './presets.js';
import { generationSchema } from '../shared/generations.js';

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.unknown())
});

describe.sequential('API unit (memory)', () => {
  let tempDir = '';
  let app: ReturnType<typeof buildServer> | undefined;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'fg-api-memory-'));
    const config = await loadTestConfig(tempDir);
    const options: BuildServerOptions = {
      config,
      presetCatalog: createTestCatalog()
    };
    app = buildServer(options);
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (tempDir.length > 0) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test(
    'given_memory_server_when_requesting_openapi_then_generation_and_event_routes_are_documented',
    async () => {
      const response = await requireApp(app).inject({
        method: 'GET',
        url: '/openapi/json'
      });
      expect(response.statusCode).toBe(200);
      const payload = openApiDocumentSchema.parse(response.json());
      expect(payload.paths).toMatchObject({
        '/api/generations': expect.any(Object),
        '/api/generations/{generationId}': expect.any(Object),
        '/api/generations/{generationId}/input': expect.any(Object),
        '/api/generations/{generationId}/queue': expect.any(Object),
        '/api/generations/{generationId}/cancel': expect.any(Object),
        '/api/events/generations': expect.any(Object)
      });
    }
  );

  test(
    'given_memory_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work',
    async () => {
      const created = await createGenerationWithInject(
        requireApp(app),
        'img2img-basic/basic'
      );

      const queueResponse = await requireApp(app).inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(queueResponse.statusCode).toBe(200);
      expect(queueResponse.json()).toMatchObject({ status: 'queued' });

      const cancelResponse = await requireApp(app).inject({
        method: 'POST',
        url: `/api/generations/${created.id}/cancel`
      });
      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({ status: 'canceled' });

      const deleteResponse = await requireApp(app).inject({
        method: 'DELETE',
        url: `/api/generations/${created.id}`
      });
      expect(deleteResponse.statusCode).toBe(204);
    }
  );

  test(
    'given_empty_upload_filename_when_uploading_input_then_route_falls_back_to_input_bin',
    async () => {
      const created = await createGenerationWithInject(
        requireApp(app),
        'img2img-basic/basic'
      );
      const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const multipart = buildMultipartPayload('', fileBuffer);

      const uploadResponse = await requireApp(app).inject({
        method: 'POST',
        url: `/api/generations/${created.id}/input`,
        headers: {
          'content-type': `multipart/form-data; boundary=${multipart.boundary}`
        },
        payload: multipart.payload
      });

      expect(uploadResponse.statusCode).toBe(204);

      const detailResponse = await requireApp(app).inject({
        method: 'GET',
        url: `/api/generations/${created.id}`
      });
      expect(detailResponse.statusCode).toBe(200);

      const detail = generationSchema.parse(detailResponse.json());
      const inputImagePath = z.string().parse(detail.presetParams.inputImagePath);

      expect(path.basename(inputImagePath)).toBe('input.bin');
      await expect(readFile(inputImagePath)).resolves.toEqual(fileBuffer);
    }
  );
});

async function createGenerationWithInject(
  app: ReturnType<typeof buildServer>,
  presetId: string
): Promise<z.infer<typeof generationSchema>> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/generations',
    payload: {
      presetId,
      presetParams: {
        prompt: 'integration test'
      }
    }
  });
  expect(response.statusCode).toBe(201);
  return generationSchema.parse(response.json());
}

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
          inputs: { prompt: '{{PROMPT}}' }
        }
      },
      placeholders: {
        '{{PROMPT}}': 'prompt'
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

function requireApp(
  app: ReturnType<typeof buildServer> | undefined
): ReturnType<typeof buildServer> {
  if (app === undefined) {
    throw new Error('Server instance was not initialized before test execution.');
  }

  return app;
}
