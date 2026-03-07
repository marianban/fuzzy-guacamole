// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import type { BuildServerOptions } from './app.js';
import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { createPresetCatalog } from './presets.js';
import { generationSchema } from '../shared/generations.js';
import { presetListResponseSchema } from '../shared/presets.js';

const mode = (process.env.API_TEST_MODE ?? 'memory').toLowerCase();
const shouldRunMemoryMode = mode === 'memory';
const shouldRunLocalMode = mode === 'local' && process.env.API_RUN_LOCAL_TESTS === '1';
const localBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.unknown())
});

describe.sequential('API integration (memory)', () => {
  const run = test.runIf(shouldRunMemoryMode);

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

  run(
    'given_memory_server_when_requesting_openapi_then_generation_and_event_routes_are_documented',
    async () => {
      const response = await app!.inject({
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

  run(
    'given_memory_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work',
    async () => {
      const created = await createGenerationWithInject(app!, 'img2img-basic/basic');

      const queueResponse = await app!.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(queueResponse.statusCode).toBe(200);
      expect(queueResponse.json()).toMatchObject({ status: 'queued' });

      const cancelResponse = await app!.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/cancel`
      });
      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({ status: 'canceled' });

      const deleteResponse = await app!.inject({
        method: 'DELETE',
        url: `/api/generations/${created.id}`
      });
      expect(deleteResponse.statusCode).toBe(204);
    }
  );
});

describe.sequential('API integration (local server)', () => {
  const run = test.runIf(shouldRunLocalMode);

  run(
    'given_local_server_when_requesting_openapi_then_generation_and_event_routes_are_documented',
    async () => {
      const response = await fetch(`${localBaseUrl}/openapi/json`);
      expect(response.status).toBe(200);
      const payload = openApiDocumentSchema.parse(await response.json());
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

  run(
    'given_local_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work',
    async () => {
      const presetId = await resolveLocalPresetId();
      const created = await createGenerationWithFetch(localBaseUrl, presetId);

      const queueResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}/queue`,
        {
          method: 'POST'
        }
      );
      expect(queueResponse.status).toBe(200);

      const cancelResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}/cancel`,
        {
          method: 'POST'
        }
      );
      expect(cancelResponse.status).toBe(200);

      const deleteResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}`,
        {
          method: 'DELETE'
        }
      );
      expect(deleteResponse.status).toBe(204);
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

async function resolveLocalPresetId(): Promise<string> {
  if (process.env.API_LOCAL_PRESET_ID) {
    return process.env.API_LOCAL_PRESET_ID;
  }

  const response = await fetch(`${localBaseUrl}/api/presets`);
  expect(response.status).toBe(200);
  const presets = presetListResponseSchema.parse(await response.json());
  expect(presets.length).toBeGreaterThan(0);

  const firstPreset = presets[0];
  if (firstPreset === undefined) {
    throw new Error(
      'No presets found in local environment. Configure presets or set API_LOCAL_PRESET_ID.'
    );
  }
  return firstPreset.id;
}

async function createGenerationWithFetch(
  baseUrl: string,
  presetId: string
): Promise<z.infer<typeof generationSchema>> {
  const response = await fetch(`${baseUrl}/api/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      presetId,
      presetParams: {
        prompt: 'integration test'
      }
    })
  });
  expect(response.status).toBe(201);
  return generationSchema.parse(await response.json());
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
    templateFile: 'prompt.template.json',
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
