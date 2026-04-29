// @vitest-environment node

import { describe, expect, test } from 'vitest';

import {
  comfyFixturePaths,
  loadCapturedComfyFixture,
  loadComfyWorkflow,
  type CapturedComfyFixture
} from '../test-support/comfy-fixtures.js';
import {
  ComfyClient,
  extractDeterministicOutputImage,
  setLoadImageReference
} from './client.js';

describe.sequential('ComfyClient unit (mock replay)', () => {
  test('given_fixture_responses_when_running_client_contract_then_health_upload_submit_poll_and_output_selection_pass', async () => {
    const fixture = await loadCapturedComfyFixture();

    const client = new ComfyClient({
      baseUrl: 'http://mocked-comfy.local',
      fetchImpl: createMockFetch(fixture),
      historyPollMs: 1,
      historyTimeoutMs: 1_000
    });

    const health = await client.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.systemStats?.system.comfyui_version).toBe('0.8.2');

    const upload = await client.uploadInputImage(comfyFixturePaths.tinyInputImage);
    expect(upload.image.filename).toBe(fixture.responses.uploadImage.name);
    expect(upload.comfyImageRef).toContain('vitest_uploaded_input.png');

    const img2imgWorkflow = setLoadImageReference(
      await loadComfyWorkflow(comfyFixturePaths.img2imgTemplate),
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
  });
});

function createMockFetch(fixture: CapturedComfyFixture): typeof fetch {
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
