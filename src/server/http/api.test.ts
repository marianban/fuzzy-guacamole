// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { appStatusResponseSchema } from '../../shared/status.js';
import { buildServer } from './server-app.js';
import type { AppRuntimeStatusService } from '../status/runtime-status.js';
import { createBuildServerOptions } from '../test-support/build-server-options.js';
import { buildMultipartPayload } from '../test-support/multipart-fixtures.js';
import { createBasicImg2ImgTestCatalog as createTestCatalog } from '../test-support/preset-catalog-fixtures.js';
import { loadTestConfig } from '../test-support/test-app-config.js';
import { generationSchema } from '../../shared/generations.js';

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.unknown())
});

describe.sequential('API unit (memory)', () => {
  let tempDir = '';
  let app: ReturnType<typeof buildServer> | undefined;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'fg-api-memory-'));
    const config = await loadTestConfig(tempDir);
    const options = createBuildServerOptions({
      config,
      presetCatalog: createTestCatalog(),
      runtimeStatus: createRuntimeStatusStub({
        current: {
          state: 'Online',
          since: '2026-04-11T09:00:00.000Z'
        },
        started: {
          state: 'Starting',
          since: '2026-04-11T09:05:00.000Z'
        }
      })
    });
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

  test('given_memory_server_when_requesting_openapi_then_generation_and_event_routes_are_documented', async () => {
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
  });

  test('given_memory_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work', async () => {
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
  });

  test('given_empty_upload_filename_when_uploading_input_then_route_falls_back_to_input_bin', async () => {
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
  });

  test('given_runtime_status_service_when_requesting_status_then_live_state_is_returned', async () => {
    const runtimeStatus = createRuntimeStatusStub({
      current: {
        state: 'Offline',
        since: '2026-04-11T09:00:00.000Z'
      },
      started: {
        state: 'Starting',
        since: '2026-04-11T09:05:00.000Z'
      }
    });
    const statusApp = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        runtimeStatus
      })
    );

    try {
      const response = await statusApp.inject({
        method: 'GET',
        url: '/api/status'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(runtimeStatus.current);
      expect(runtimeStatus.getStatus).toHaveBeenCalledTimes(1);
    } finally {
      await statusApp.close();
    }
  });

  test('given_runtime_status_service_when_starting_comfy_then_current_starting_state_is_returned', async () => {
    const runtimeStatus = createRuntimeStatusStub({
      current: {
        state: 'Offline',
        since: '2026-04-11T09:00:00.000Z'
      },
      started: {
        state: 'Starting',
        since: '2026-04-11T09:05:00.000Z'
      }
    });
    const statusApp = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        runtimeStatus
      })
    );

    try {
      const response = await statusApp.inject({
        method: 'POST',
        url: '/api/comfy/start'
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual(runtimeStatus.started);
      expect(runtimeStatus.start).toHaveBeenCalledTimes(1);
    } finally {
      await statusApp.close();
    }
  });
});

function createRuntimeStatusStub(values: {
  current: z.infer<typeof appStatusResponseSchema>;
  started: z.infer<typeof appStatusResponseSchema>;
}) {
  const runtimeStatus: AppRuntimeStatusService & {
    current: z.infer<typeof appStatusResponseSchema>;
    started: z.infer<typeof appStatusResponseSchema>;
  } = {
    current: appStatusResponseSchema.parse(values.current),
    started: appStatusResponseSchema.parse(values.started),
    getStatus: vi.fn(() => appStatusResponseSchema.parse(values.current)),
    start: vi.fn(async () => appStatusResponseSchema.parse(values.started)),
    ensureOnline: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  };

  return runtimeStatus;
}

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

function requireApp(
  app: ReturnType<typeof buildServer> | undefined
): ReturnType<typeof buildServer> {
  if (app === undefined) {
    throw new Error('Server instance was not initialized before test execution.');
  }

  return app;
}
