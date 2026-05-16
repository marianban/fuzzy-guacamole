import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appStatusResponseSchema, type AppStatusState } from '../../shared/status.js';
import type { AppRuntimeStatusService } from '../status/runtime-status.js';

export interface CapturedComfyFixture {
  metadata: {
    capturedAt: string;
    comfyVersion: string;
    notes?: string;
  };
  responses: {
    healthCheck: unknown;
    uploadImage: {
      name: string;
      subfolder?: string;
      type?: string;
    };
    submitPrompt: {
      prompt_id: string;
      number?: number;
      node_errors?: Record<string, unknown>;
    };
    historyByPrompt: Record<string, unknown>;
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const comfyDir = path.resolve(currentDir, '../comfy');

export const comfyFixturePaths = {
  capturedContract: path.resolve(
    comfyDir,
    '__fixtures__/captured/comfy-v0.8.2-contract.json'
  ),
  tinyInputImage: path.resolve(comfyDir, '__fixtures__/input/tiny.png'),
  liankaInputImage: path.resolve(
    comfyDir,
    '__fixtures__/input/liankavalentincropped.png'
  ),
  outputDir: path.resolve(comfyDir, '__fixtures__/output'),
  txt2imgTemplate: path.resolve(currentDir, '../../../examples/prompts/txt2img.json'),
  img2imgTemplate: path.resolve(currentDir, '../../../examples/prompts/img2img.json')
};

export async function loadCapturedComfyFixture(): Promise<CapturedComfyFixture> {
  const fixtureRaw = await readFile(comfyFixturePaths.capturedContract, 'utf8');
  return JSON.parse(fixtureRaw) as CapturedComfyFixture;
}

export async function loadComfyWorkflow(
  filePath: string
): Promise<Record<string, unknown>> {
  const source = await readFile(filePath, 'utf8');
  return JSON.parse(source) as Record<string, unknown>;
}

export function createRuntimeStatusFixture(
  state: AppStatusState,
  options: {
    lastError?: string;
    since?: string;
  } = {}
): AppRuntimeStatusService {
  const status = appStatusResponseSchema.parse({
    state,
    since: options.since ?? '2026-04-07T10:00:00.000Z',
    ...(options.lastError !== undefined ? { lastError: options.lastError } : {}),
    ...(state === 'Online' ? { comfy: {} } : {})
  });

  return {
    getStatus() {
      return status;
    },
    async start() {
      return status;
    },
    async ensureOnline() {
      return;
    },
    async stop() {
      return;
    }
  };
}

export function createOnlineRuntimeStatusFixture(
  since?: string
): AppRuntimeStatusService {
  return createRuntimeStatusFixture('Online', { since });
}
