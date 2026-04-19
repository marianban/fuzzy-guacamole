// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  ComfyClient,
  extractDeterministicOutputImage,
  setLoadImageReference
} from './client.js';

interface CapturedFixture {
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
const fixturePath = path.resolve(
  currentDir,
  '__fixtures__/captured/comfy-v0.8.2-contract.json'
);
const tinyPngPath = path.resolve(currentDir, '__fixtures__/input/tiny.png');
const img2imgTemplatePath = path.resolve(currentDir, '../../../examples/prompts/img2img.json');

describe.sequential('ComfyClient unit (mock replay)', () => {
  test(
    'given_fixture_responses_when_running_client_contract_then_health_upload_submit_poll_and_output_selection_pass',
    async () => {
      const fixture = await loadFixture();

      const client = new ComfyClient({
        baseUrl: 'http://mocked-comfy.local',
        fetchImpl: createMockFetch(fixture),
        historyPollMs: 1,
        historyTimeoutMs: 1_000
      });

      const health = await client.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.systemStats?.system.comfyui_version).toBe('0.8.2');

      const upload = await client.uploadInputImage(tinyPngPath);
      expect(upload.image.filename).toBe(fixture.responses.uploadImage.name);
      expect(upload.comfyImageRef).toContain('vitest_uploaded_input.png');

      const img2imgWorkflow = setLoadImageReference(
        await loadWorkflow(img2imgTemplatePath),
        upload.comfyImageRef,
        '12'
      );
      const loadImageNode = img2imgWorkflow['12'] as { inputs: { image: string } };
      expect(loadImageNode.inputs.image).toBe(upload.comfyImageRef);

      const submitResult = await client.submitPrompt(img2imgWorkflow);
      expect(submitResult.promptId).toBe(fixture.responses.submitPrompt.prompt_id);

      const historyResult = await client.pollHistory(submitResult.promptId, {
        pollMs: 1,
        timeoutMs: 50
      });
      expect(Object.keys(historyResult.entry.outputs ?? {})).toContain('3');

      const outputImage = extractDeterministicOutputImage(
        historyResult.history,
        submitResult.promptId,
        '3'
      );
      expect(outputImage.nodeId).toBe('3');
      expect(outputImage.filename).toContain('ComfyUI');
    }
  );
});

async function loadFixture(): Promise<CapturedFixture> {
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  return JSON.parse(fixtureRaw) as CapturedFixture;
}

async function loadWorkflow(filePath: string): Promise<Record<string, unknown>> {
  const source = await readFile(filePath, 'utf8');
  return JSON.parse(source) as Record<string, unknown>;
}

function createMockFetch(fixture: CapturedFixture): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(requestUrl);

    if (method === 'GET' && url.pathname === '/api/system_stats') {
      return jsonResponse(fixture.responses.healthCheck);
    }

    if (
      method === 'POST' &&
      (url.pathname === '/api/upload/image' || url.pathname === '/upload/image')
    ) {
      return jsonResponse(fixture.responses.uploadImage);
    }

    if (
      method === 'POST' &&
      (url.pathname === '/api/prompt' || url.pathname === '/prompt')
    ) {
      return jsonResponse(fixture.responses.submitPrompt);
    }

    if (method === 'GET' && url.pathname.startsWith('/api/history_v2/')) {
      const promptId = url.pathname.split('/').at(-1);
      if (promptId === undefined) {
        return jsonResponse({}, 404);
      }
      const history = fixture.responses.historyByPrompt[promptId];
      return history !== undefined ? jsonResponse(history) : jsonResponse({});
    }

    if (method === 'GET' && url.pathname.startsWith('/history/')) {
      const promptId = url.pathname.split('/').at(-1);
      if (promptId === undefined) {
        return jsonResponse({}, 404);
      }
      const history = fixture.responses.historyByPrompt[promptId];
      return history !== undefined ? jsonResponse(history) : jsonResponse({});
    }

    if (
      method === 'POST' &&
      (url.pathname === '/api/interrupt' || url.pathname === '/interrupt')
    ) {
      return jsonResponse({});
    }

    return jsonResponse(
      { message: `Unhandled mock request: ${method} ${url.pathname}` },
      404
    );
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
