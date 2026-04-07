// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { generationSchema } from '../shared/generations.js';
import {
  presetDetailSchema,
  presetListResponseSchema,
  presetSummarySchema
} from '../shared/presets.js';
import { requireTestEnvVar } from './test-env.js';

const localBaseUrl = requireTestEnvVar('API_BASE_URL');
const img2imgInputFixturePath = path.resolve(
  process.cwd(),
  'src/server/comfy/__fixtures__/input/tiny.png'
);

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.unknown())
});

describe.sequential('API integration (local server)', () => {
  test('given_local_server_when_requesting_openapi_then_generation_and_event_routes_are_documented', async () => {
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
  });

  test('given_local_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work', async () => {
    const preset = await resolveLocalPreset();
    const created = await createGenerationWithFetch(localBaseUrl, preset.id);

    if (preset.type === 'img2img') {
      await uploadGenerationInputWithFetch(localBaseUrl, created.id);
    }

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

    const deleteResponse = await fetch(`${localBaseUrl}/api/generations/${created.id}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBe(204);
  });
});

async function resolveLocalPreset(): Promise<z.infer<typeof presetSummarySchema>> {
  if (process.env.API_LOCAL_PRESET_ID) {
    const response = await fetch(
      `${localBaseUrl}/api/presets/${encodeURIComponent(process.env.API_LOCAL_PRESET_ID)}`
    );
    expect(response.status).toBe(200);
    const preset = presetDetailSchema.parse(await response.json());
    return {
      id: preset.id,
      name: preset.name,
      type: preset.type,
      templateId: preset.templateId,
      templateFile: preset.templateFile,
      defaults: preset.defaults
    };
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

  return firstPreset;
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

async function uploadGenerationInputWithFetch(
  baseUrl: string,
  generationId: string
): Promise<void> {
  const payload = new FormData();
  const inputBuffer = await readFile(img2imgInputFixturePath);
  payload.set('file', new Blob([inputBuffer], { type: 'image/png' }), 'tiny.png');

  const response = await fetch(`${baseUrl}/api/generations/${generationId}/input`, {
    method: 'POST',
    body: payload
  });

  expect(response.status).toBe(204);
}
