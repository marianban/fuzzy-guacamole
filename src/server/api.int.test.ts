// @vitest-environment node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { generationSchema } from '../shared/generations.js';
import {
  presetDetailSchema,
  presetListResponseSchema,
  presetSummarySchema
} from '../shared/presets.js';
import { appStatusResponseSchema } from '../shared/status.js';
import { requireTestEnvVar } from './test-support/test-env.js';

const localBaseUrl = requireTestEnvVar('API_BASE_URL');
const img2imgInputFixturePath = path.resolve(
  process.cwd(),
  'src/server/comfy/__fixtures__/input/tiny.png'
);

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.unknown())
});

const localGenerationTimeoutMs = 30_000;
const localImageGenerationTimeoutMs = 900_000;
const localGenerationPollIntervalMs = 2_000;
const localOutputsDir = path.resolve(process.cwd(), 'data/outputs');

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

  test('given_local_server_when_listing_presets_then_response_contains_every_shipped_preset', async () => {
    const response = await fetch(`${localBaseUrl}/api/presets`);
    expect(response.status).toBe(200);

    const presets = presetListResponseSchema.parse(await response.json());
    const shippedPresetIds = await listShippedPresetIds();

    expect(presets.map((preset) => preset.id).sort()).toEqual(shippedPresetIds);
  });

  test('given_local_server_when_requesting_each_shipped_preset_then_detail_endpoint_returns_it', async () => {
    const response = await fetch(`${localBaseUrl}/api/presets`);
    expect(response.status).toBe(200);

    const presets = presetListResponseSchema.parse(await response.json());
    const shippedPresetIds = await listShippedPresetIds();

    await Promise.all(
      shippedPresetIds.map(async (presetId) => {
        const presetSummary = presets.find((preset) => preset.id === presetId);
        expect(presetSummary).toBeDefined();

        const detailResponse = await fetch(
          `${localBaseUrl}/api/presets/${encodeURIComponent(presetId)}`
        );
        expect(detailResponse.status).toBe(200);

        const presetDetail = presetDetailSchema.parse(await detailResponse.json());
        expect(presetDetail).toMatchObject({
          id: presetSummary?.id,
          name: presetSummary?.name,
          type: presetSummary?.type,
          templateId: presetSummary?.templateId,
          templateFile: presetSummary?.templateFile,
          defaults: presetSummary?.defaults
        });
      })
    );
  });

  test(
    'given_local_server_when_running_generation_lifecycle_then_create_queue_cancel_and_delete_work',
    async () => {
      const preset = await resolveLocalPreset();
      const created = await createGenerationWithFetch(localBaseUrl, preset.id);

      if (preset.type === 'img2img') {
        await uploadGenerationInputWithFetch(localBaseUrl, created.id);
      }

      await ensureLocalRuntimeQueueReady();

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

      const canceledGeneration = generationSchema.parse(await cancelResponse.json());
      expect(canceledGeneration.status).toMatch(/canceled|completed|failed/);

      const deleteResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}`,
        {
          method: 'DELETE'
        }
      );
      expect(deleteResponse.status).toBe(204);
    },
    localGenerationTimeoutMs
  );

  test(
    'given_local_server_when_queueing_txt2img_ernie_preset_then_generation_completes_and_output_image_is_stored',
    async () => {
      const preset = await requireLocalPresetById('txt2img-ernie/basic');

      const created = await createGenerationWithFetch(localBaseUrl, preset.id, {
        prompt: 'A simple lighthouse on a rocky coast at sunrise, cinematic lighting.',
        width: 512,
        height: 512,
        steps: 4,
        cfg: 1,
        seedMode: 'fixed',
        seed: 123456789
      });

      await ensureLocalRuntimeQueueReady();

      const queueResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}/queue`,
        {
          method: 'POST'
        }
      );
      expect(queueResponse.status).toBe(200);

      const completedGeneration = await waitForTerminalGenerationStatus(
        localBaseUrl,
        created.id,
        localImageGenerationTimeoutMs
      );

      expect(completedGeneration.status).toBe('completed');

      const outputFiles = await waitForOutputFiles(
        created.id,
        localImageGenerationTimeoutMs
      );
      expect(outputFiles.length).toBeGreaterThan(0);

      const firstOutputPath = path.join(
        localOutputsDir,
        created.id,
        outputFiles[0] ?? 'missing'
      );
      const outputStats = await stat(firstOutputPath);
      expect(outputStats.isFile()).toBe(true);
      expect(outputStats.size).toBeGreaterThan(0);

      const deleteResponse = await fetch(
        `${localBaseUrl}/api/generations/${created.id}`,
        {
          method: 'DELETE'
        }
      );
      expect(deleteResponse.status).toBe(204);
    },
    localImageGenerationTimeoutMs
  );
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

async function requireLocalPresetById(
  presetId: string
): Promise<z.infer<typeof presetDetailSchema>> {
  const response = await fetch(
    `${localBaseUrl}/api/presets/${encodeURIComponent(presetId)}`
  );

  if (response.status === 404) {
    throw new Error(
      `Preset ${presetId} is not available from the running API server at ${localBaseUrl}. ` +
        'Restart the local server so it reloads data/presets before rerunning this integration test.'
    );
  }

  expect(response.status).toBe(200);
  return presetDetailSchema.parse(await response.json());
}

async function createGenerationWithFetch(
  baseUrl: string,
  presetId: string,
  presetParams: Record<string, unknown> = {
    prompt: 'integration test'
  }
): Promise<z.infer<typeof generationSchema>> {
  const response = await fetch(`${baseUrl}/api/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      presetId,
      presetParams
    })
  });
  expect(response.status).toBe(201);
  return generationSchema.parse(await response.json());
}

async function waitForTerminalGenerationStatus(
  baseUrl: string,
  generationId: string,
  timeoutMs: number
): Promise<z.infer<typeof generationSchema>> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/api/generations/${generationId}`);
    expect(response.status).toBe(200);

    const generation = generationSchema.parse(await response.json());
    if (
      generation.status === 'completed' ||
      generation.status === 'failed' ||
      generation.status === 'canceled'
    ) {
      return generation;
    }

    await wait(localGenerationPollIntervalMs);
  }

  throw new Error(
    `Generation ${generationId} did not reach a terminal state within ${timeoutMs}ms.`
  );
}

async function waitForOutputFiles(
  generationId: string,
  timeoutMs: number
): Promise<string[]> {
  const startedAt = Date.now();
  const outputDir = path.join(localOutputsDir, generationId);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const outputFiles = await readdir(outputDir);
      if (outputFiles.length > 0) {
        return outputFiles;
      }
    } catch {
      // Output directory may not exist until the generation finishes writing.
    }

    await wait(localGenerationPollIntervalMs);
  }

  throw new Error(
    `No output files found for generation ${generationId} within ${timeoutMs}ms.`
  );
}

async function listShippedPresetIds(): Promise<string[]> {
  const presetsRoot = path.resolve(process.cwd(), 'data/presets');
  const templateDirectories = await readdir(presetsRoot, { withFileTypes: true });

  const presetIds = await Promise.all(
    templateDirectories
      .filter((entry) => entry.isDirectory())
      .map(async (templateDirectory) => {
        const templatePath = path.join(presetsRoot, templateDirectory.name);
        const templateEntries = await readdir(templatePath, { withFileTypes: true });

        return templateEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.preset.json'))
          .map(
            (entry) =>
              `${templateDirectory.name}/${entry.name.replace(/\.preset\.json$/, '')}`
          );
      })
  );

  return presetIds.flat().sort();
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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

async function ensureLocalRuntimeQueueReady(): Promise<void> {
  const currentStatusResponse = await fetch(`${localBaseUrl}/api/status`);
  expect(currentStatusResponse.status).toBe(200);

  const currentStatus = appStatusResponseSchema.parse(await currentStatusResponse.json());

  if (currentStatus.state === 'Online' || currentStatus.state === 'Starting') {
    return;
  }

  const startupResponse = await fetch(`${localBaseUrl}/api/comfy/start`, {
    method: 'POST'
  });
  expect([200, 202]).toContain(startupResponse.status);

  const startupStatus = appStatusResponseSchema.parse(await startupResponse.json());
  expect(['Online', 'Starting']).toContain(startupStatus.state);
}
