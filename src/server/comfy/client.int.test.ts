// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { comfyFixturePaths, loadComfyWorkflow } from '../test-support/comfy-fixtures.js';
import { requireTestEnvVar } from '../test-support/test-env.js';
import { ComfyClient, setLoadImageReference } from './client.js';

const baseUrl = requireTestEnvVar('COMFY_BASE_URL');
const requestTimeoutMs = 10_000;
const historyPollMs = 1_000;
const historyTimeoutMs = 180_000;

describe.sequential('ComfyClient integration (local ComfyUI)', () => {
  test('given_local_comfy_when_checking_health_then_system_stats_are_available', async () => {
    const client = new ComfyClient({
      baseUrl,
      requestTimeoutMs,
      historyPollMs,
      historyTimeoutMs
    });

    const health = await client.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.systemStats?.system.comfyui_version).toBeTruthy();
    expect(health.systemStats?.devices.length).toBeGreaterThan(0);
  });

  test('given_local_comfy_when_uploading_img2img_input_then_comfy_reference_is_returned_for_loadimage', async () => {
    const client = new ComfyClient({
      baseUrl,
      requestTimeoutMs,
      historyPollMs,
      historyTimeoutMs
    });
    const upload = await client.uploadInputImage(comfyFixturePaths.tinyInputImage);
    expect(upload.image.filename).toContain('.png');
    const img2imgWorkflow = setLoadImageReference(
      await loadComfyWorkflow(comfyFixturePaths.img2imgTemplate),
      upload.comfyImageRef,
      '12'
    );

    const loadImageNode = img2imgWorkflow['12'] as { inputs: { image: string } };
    expect(loadImageNode.inputs.image).toBe(upload.comfyImageRef);
  });
});
