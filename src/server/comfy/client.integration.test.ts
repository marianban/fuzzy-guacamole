// @vitest-environment node

import { readFile, writeFile } from 'node:fs/promises';
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

const mode = (process.env.COMFY_TEST_MODE ?? 'mock').toLowerCase();
const shouldRunMockMode = mode === 'mock';
const shouldRunLocalMode = mode === 'local' && process.env.COMFY_RUN_LOCAL_TESTS === '1';

const baseUrl = process.env.COMFY_BASE_URL ?? 'http://127.0.0.1:8188';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const fixturePath = path.resolve(
  currentDir,
  '__fixtures__/captured/comfy-v0.8.2-contract.json'
);
const tinyPngPath = path.resolve(currentDir, '__fixtures__/input/tiny.png');
const txt2imgTemplatePath = path.resolve(currentDir, '../../../examples/prompts/txt2img.json');
const img2imgTemplatePath = path.resolve(currentDir, '../../../examples/prompts/img2img.json');

describe.sequential('ComfyClient integration (mock replay)', () => {
  const run = test.runIf(shouldRunMockMode);

  run(
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

      const img2imgWorkflow = await loadWorkflow(img2imgTemplatePath);
      setLoadImageReference(img2imgWorkflow, upload.comfyImageRef, '12');
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

describe.sequential('ComfyClient integration (local ComfyUI)', () => {
  const run = test.runIf(shouldRunLocalMode);

  run(
    'given_local_comfy_when_checking_health_then_system_stats_are_available',
    async () => {
      const client = new ComfyClient({ baseUrl });

      const health = await client.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.systemStats?.system.comfyui_version).toBeTruthy();
      expect(health.systemStats?.devices.length).toBeGreaterThan(0);
    }
  );

  run(
    'given_local_comfy_when_uploading_img2img_input_then_comfy_reference_is_returned_for_loadimage',
    async () => {
      const client = new ComfyClient({ baseUrl });
      const img2imgWorkflow = await loadWorkflow(img2imgTemplatePath);

      const upload = await client.uploadInputImage(tinyPngPath);
      expect(upload.image.filename).toContain('.png');

      setLoadImageReference(img2imgWorkflow, upload.comfyImageRef, '12');
      const loadImageNode = img2imgWorkflow['12'] as { inputs: { image: string } };
      expect(loadImageNode.inputs.image).toBe(upload.comfyImageRef);
    }
  );

  run(
    'given_local_comfy_when_submitting_prompt_then_poll_history_returns_non_empty_outputs',
    { timeout: 600_000 },
    async () => {
      const client = new ComfyClient({
        baseUrl,
        historyPollMs: 1_000,
        historyTimeoutMs: 300_000
      });
      const txt2imgWorkflow = await loadWorkflow(txt2imgTemplatePath);
      prepareTxt2ImgWorkflowForFastTest(txt2imgWorkflow);

      const submitted = await client.submitPrompt(txt2imgWorkflow);
      expect(submitted.promptId.length).toBeGreaterThan(0);

      const historyResult = await client.pollHistory(submitted.promptId);
      expect(Object.keys(historyResult.entry.outputs ?? {}).length).toBeGreaterThan(0);

      const outputImage = extractDeterministicOutputImage(
        historyResult.history,
        submitted.promptId,
        '60'
      );
      expect(outputImage.filename.length).toBeGreaterThan(0);

      if (process.env.COMFY_CAPTURE_FIXTURE === '1') {
        await writeCapturedFixture(submitted.promptId, historyResult.history);
      }
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

function prepareTxt2ImgWorkflowForFastTest(workflow: Record<string, unknown>): void {
  const samplerNode = workflow['3'] as { inputs?: Record<string, unknown> } | undefined;
  if (samplerNode?.inputs !== undefined) {
    samplerNode.inputs.seed = 123456789;
    samplerNode.inputs.steps = 4;
  }

  const latentNode = workflow['58'] as { inputs?: Record<string, unknown> } | undefined;
  if (latentNode?.inputs !== undefined) {
    latentNode.inputs.width = 256;
    latentNode.inputs.height = 256;
  }

  const positiveNode = workflow['6'] as { inputs?: Record<string, unknown> } | undefined;
  if (positiveNode?.inputs !== undefined) {
    positiveNode.inputs.text =
      'A simple still life photo of a red apple on a wooden table. Natural light.';
  }

  const saveNode = workflow['60'] as { inputs?: Record<string, unknown> } | undefined;
  if (saveNode?.inputs !== undefined) {
    saveNode.inputs.filename_prefix = `vitest_txt2img_${Date.now()}`;
  }
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

async function writeCapturedFixture(
  promptId: string,
  history: Record<string, { outputs?: Record<string, unknown> | undefined }>
): Promise<void> {
  const fixture = await loadFixture();

  fixture.metadata.capturedAt = new Date().toISOString();
  fixture.responses.submitPrompt.prompt_id = promptId;
  fixture.responses.historyByPrompt = {
    [promptId]: history
  };

  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}
