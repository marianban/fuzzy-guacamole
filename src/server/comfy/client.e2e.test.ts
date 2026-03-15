// @vitest-environment node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const baseUrl = process.env.COMFY_BASE_URL ?? 'http://127.0.0.1:8188';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const fixturePath = path.resolve(
  currentDir,
  '__fixtures__/captured/comfy-v0.8.2-contract.json'
);
const tinyPngPath = path.resolve(currentDir, '__fixtures__/input/tiny.png');
const liankaInputImagePath = path.resolve(
  currentDir,
  '__fixtures__/input/liankavalentincropped.png'
);
const outputDirPath = path.resolve(currentDir, '__fixtures__/output');
const txt2imgTemplatePath = path.resolve(currentDir, '../../../examples/prompts/txt2img.json');
const img2imgTemplatePath = path.resolve(currentDir, '../../../examples/prompts/img2img.json');

describe.sequential('ComfyClient e2e (local ComfyUI)', () => {
  test(
    'given_local_comfy_when_checking_health_then_system_stats_are_available',
    async () => {
      const client = new ComfyClient({ baseUrl });

      const health = await client.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.systemStats?.system.comfyui_version).toBeTruthy();
      expect(health.systemStats?.devices.length).toBeGreaterThan(0);
    }
  );

  test(
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

  test(
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

  test(
    'given_local_comfy_when_running_img2img_with_lianka_input_then_poll_until_done_and_download_output',
    { timeout: 900_000 },
    async () => {
      const startedAt = Date.now();
      const client = new ComfyClient({
        baseUrl,
        historyPollMs: 1_500,
        historyTimeoutMs: 720_000
      });
      const img2imgWorkflow = await loadWorkflow(img2imgTemplatePath);

      const upload = await client.uploadInputImage(liankaInputImagePath);
      setLoadImageReference(img2imgWorkflow, upload.comfyImageRef, '12');
      setImg2ImgPrompt(img2imgWorkflow, startedAt);

      const submitted = await client.submitPrompt(img2imgWorkflow);
      expect(submitted.promptId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      const historyResult = await client.pollHistory(submitted.promptId);
      expect(historyResult.history[submitted.promptId]).toBeDefined();
      const outputImage = extractDeterministicOutputImage(
        historyResult.history,
        submitted.promptId,
        '3'
      );
      const downloadedImage = await client.downloadImage(outputImage);
      await saveOutputImageFixture(submitted.promptId, outputImage.filename, downloadedImage);

      expect(downloadedImage.byteLength).toBeGreaterThan(0);
      const elapsedMs = Date.now() - startedAt;
      console.info(
        `Comfy local img2img completed promptId=${submitted.promptId} durationMs=${elapsedMs}`
      );
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

function setImg2ImgPrompt(workflow: Record<string, unknown>, nonce: number): void {
  const positivePromptNode = workflow['14'] as
    | { inputs?: Record<string, unknown> }
    | undefined;
  if (positivePromptNode?.inputs !== undefined) {
    positivePromptNode.inputs.prompt =
      "transform style to european children's book illustration, watercolor, muted pastel palette.";
  }

  const samplerNode = workflow['7'] as { inputs?: Record<string, unknown> } | undefined;
  if (samplerNode?.inputs !== undefined) {
    samplerNode.inputs.seed = nonce;
  }

  const saveNode = workflow['3'] as { inputs?: Record<string, unknown> } | undefined;
  if (saveNode?.inputs !== undefined) {
    saveNode.inputs.filename_prefix = `vitest_img2img_${nonce}`;
  }
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

async function saveOutputImageFixture(
  promptId: string,
  originalFilename: string,
  imageBytes: Buffer
): Promise<void> {
  await mkdir(outputDirPath, { recursive: true });
  const extension = path.extname(originalFilename) || '.png';
  const outputFilename = `img2img_${promptId}${extension}`;
  const outputPath = path.join(outputDirPath, outputFilename);
  await writeFile(outputPath, imageBytes);
}
