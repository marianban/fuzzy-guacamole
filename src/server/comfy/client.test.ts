// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ComfyClient,
  buildComfyImageRef,
  extractDeterministicOutputImage,
  setLoadImageReference
} from './client.js';

interface MockResponseConfig {
  status?: number;
  body?: unknown;
  contentType?: string;
  binary?: Uint8Array;
}

function createJsonResponse(config: MockResponseConfig = {}): Response {
  const status = config.status ?? 200;
  const headers = new Headers();
  headers.set('Content-Type', config.contentType ?? 'application/json');
  const body =
    config.body !== undefined
      ? JSON.stringify(config.body)
      : status === 200
        ? '{}'
        : JSON.stringify({ message: 'error' });
  return new Response(body, { status, headers });
}

function createBinaryResponse(
  binary: Uint8Array,
  config: Omit<MockResponseConfig, 'binary'> = {}
): Response {
  const status = config.status ?? 200;
  const headers = new Headers();
  headers.set('Content-Type', config.contentType ?? 'application/octet-stream');
  return new Response(binary, { status, headers });
}

describe('ComfyClient', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_system_stats_ok_when_running_healthcheck_then_parsed_stats_are_returned', async () => {
    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({
        body: {
          system: { comfyui_version: '1.2.3' },
          devices: [{ name: 'GPU', type: 'cuda' }]
        }
      });
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    const result = await client.healthCheck();

    expect(result.ok).toBe(true);
    expect(result.systemStats?.system.comfyui_version).toBe('1.2.3');
  });

  it('given_invalid_health_response_when_running_healthcheck_then_false_is_returned', async () => {
    const nonOkFetch: typeof fetch = async () => createJsonResponse({ status: 503 });
    const badSchemaFetch: typeof fetch = async () =>
      createJsonResponse({ body: { system: { comfyui_version: 123 }, devices: [] } });

    const nonOkClient = new ComfyClient({
      baseUrl: 'http://localhost:8188',
      fetchImpl: nonOkFetch
    });
    const badSchemaClient = new ComfyClient({
      baseUrl: 'http://localhost:8188',
      fetchImpl: badSchemaFetch
    });

    await expect(nonOkClient.healthCheck()).resolves.toEqual({ ok: false });
    await expect(badSchemaClient.healthCheck()).resolves.toEqual({ ok: false });
  });

  it('given_prompt_fallback_when_primary_endpoint_404_then_secondary_endpoint_is_used', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body: parsedBody });
      if (url.endsWith('/api/prompt')) {
        return createJsonResponse({ status: 404, body: { message: 'missing' } });
      }
      return createJsonResponse({
        body: { prompt_id: 'prompt-1', number: 7, node_errors: { n1: 'warn' } }
      });
    };
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188/', fetchImpl });

    const result = await client.submitPrompt({ foo: 'bar' });

    expect(result).toEqual({
      promptId: 'prompt-1',
      queueNumber: 7,
      nodeErrors: { n1: 'warn' }
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('http://localhost:8188/api/prompt');
    expect(calls[1]?.url).toBe('http://localhost:8188/prompt');
    expect(calls[1]?.body).toEqual({ prompt: { foo: 'bar' } });
  });

  it('given_server_error_when_submitting_prompt_then_message_is_included_in_error', async () => {
    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({ status: 500, body: { message: 'bad prompt' } });
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    await expect(client.submitPrompt({})).rejects.toThrow(
      'submit prompt failed at /api/prompt: 500 bad prompt'
    );
  });

  it('given_upload_response_when_uploading_image_then_comfy_reference_is_built', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-client-test-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'input.png');
    await writeFile(filePath, Buffer.from([137, 80, 78, 71]));

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/upload/image')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return createJsonResponse({
          body: { filename: 'uploaded.png', subfolder: 'input', type: 'input' }
        });
      }
      return createJsonResponse({ status: 404 });
    };
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    const result = await client.uploadInputImage(filePath);

    expect(result).toEqual({
      comfyImageRef: 'input/uploaded.png',
      image: { filename: 'uploaded.png', subfolder: 'input', type: 'input' }
    });
  });

  it('given_upload_response_without_type_when_uploading_image_then_type_defaults_to_input', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-client-test-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'input.png');
    await writeFile(filePath, Buffer.from([137, 80, 78, 71]));

    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({
        body: { name: 'just-name.png', subfolder: '' }
      });
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    const result = await client.uploadInputImage(filePath);

    expect(result.image.type).toBe('input');
    expect(result.comfyImageRef).toBe('just-name.png');
  });

  it('given_interrupt_fallback_when_primary_endpoint_404_then_secondary_endpoint_is_used', async () => {
    const calledUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.endsWith('/api/interrupt')) {
        return createJsonResponse({ status: 404 });
      }
      return createJsonResponse({});
    };
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    await expect(client.interrupt()).resolves.toBeUndefined();
    expect(calledUrls).toEqual([
      'http://localhost:8188/api/interrupt',
      'http://localhost:8188/interrupt'
    ]);
  });

  it('given_missing_history_api_when_loading_history_then_history_fallback_is_used', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/api/history_v2/')) {
        return createJsonResponse({ status: 404, body: { message: 'missing' } });
      }
      return createJsonResponse({
        body: {
          'id with spaces': { outputs: { '3': { images: [{ filename: 'out.png' }] } } }
        }
      });
    };
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    const history = await client.getHistoryForPrompt('id with spaces');

    expect(history['id with spaces']?.outputs).toBeDefined();
  });

  it('given_polled_history_when_outputs_become_available_then_poll_history_returns_entry', async () => {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;
      if (callCount < 2) {
        return createJsonResponse({ body: { 'p-1': { outputs: {} } } });
      }
      return createJsonResponse({
        body: { 'p-1': { outputs: { '3': { images: [{ filename: 'done.png' }] } } } }
      });
    };
    const client = new ComfyClient({
      baseUrl: 'http://localhost:8188',
      fetchImpl,
      historyPollMs: 0,
      historyTimeoutMs: 50
    });

    const result = await client.pollHistory('p-1', { pollMs: 0, timeoutMs: 50 });

    expect(Object.keys(result.entry.outputs ?? {})).toContain('3');
  });

  it('given_empty_polled_history_when_timeout_reached_then_poll_history_throws', async () => {
    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({ body: { 'p-timeout': { outputs: {} } } });
    const client = new ComfyClient({
      baseUrl: 'http://localhost:8188',
      fetchImpl,
      historyPollMs: 0,
      historyTimeoutMs: 1
    });

    await expect(
      client.pollHistory('p-timeout', {
        pollMs: 0,
        timeoutMs: 1
      })
    ).rejects.toThrow('History timeout for prompt p-timeout after 1ms.');
  });

  it('given_download_primary_404_when_downloading_image_then_binary_fallback_endpoint_is_used', async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/api/view?')) {
        return createJsonResponse({ status: 404, body: { message: 'missing' } });
      }
      return createBinaryResponse(imageBytes);
    };
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    const downloaded = await client.downloadImage({
      filename: 'result.png',
      subfolder: 'output',
      type: 'output'
    });

    expect(downloaded).toEqual(Buffer.from(imageBytes));
  });

  it('given_download_server_error_when_downloading_image_then_error_includes_message', async () => {
    const fetchImpl: typeof fetch = async () =>
      createJsonResponse({ status: 500, body: { message: 'cannot read file' } });
    const client = new ComfyClient({ baseUrl: 'http://localhost:8188', fetchImpl });

    await expect(
      client.downloadImage({
        filename: 'result.png'
      })
    ).rejects.toThrow('download image result.png failed at /api/view?filename=result.png: 500 cannot read file');
  });
});

describe('Comfy client helpers', () => {
  it('given_image_reference_with_and_without_subfolder_when_building_reference_then_expected_value_is_returned', () => {
    expect(buildComfyImageRef({ filename: 'x.png' })).toBe('x.png');
    expect(buildComfyImageRef({ filename: 'x.png', subfolder: 'input' })).toBe(
      'input/x.png'
    );
  });

  it('given_workflow_with_loadimage_when_setting_reference_then_target_node_is_updated', () => {
    const workflow: Record<string, unknown> = {
      '12': { class_type: 'LoadImage', inputs: {} },
      '14': { class_type: 'OtherNode', inputs: {} }
    };

    const updated = setLoadImageReference(workflow, 'input/my-file.png');

    expect(updated['12']).toMatchObject({
      class_type: 'LoadImage',
      inputs: { image: 'input/my-file.png' }
    });
  });

  it('given_missing_loadimage_when_setting_reference_then_error_is_thrown', () => {
    const workflow: Record<string, unknown> = {
      '14': { class_type: 'OtherNode', inputs: {} }
    };

    expect(() => setLoadImageReference(workflow, 'input/missing.png')).toThrow(
      'LoadImage node was not found in workflow.'
    );
  });

  it('given_preferred_and_sorted_outputs_when_extracting_output_then_deterministic_selection_is_used', () => {
    const history: Record<string, { outputs?: Record<string, unknown> | undefined }> = {
      p1: {
        outputs: {
          '10': { images: [{ filename: 'late.png', subfolder: 'output', type: 'output' }] },
          '3': { gifs: [{ filename: 'early.gif' }] },
          alpha: { audio: [{ filename: 'clip.wav' }] }
        }
      }
    };

    const preferred = extractDeterministicOutputImage(history, 'p1', '10');
    expect(preferred).toEqual({
      nodeId: '10',
      filename: 'late.png',
      subfolder: 'output',
      type: 'output'
    });

    const sorted = extractDeterministicOutputImage(history, 'p1');
    expect(sorted).toEqual({
      nodeId: '3',
      filename: 'early.gif'
    });
  });

  it('given_outputs_without_images_when_extracting_output_then_error_is_thrown', () => {
    const history: Record<string, { outputs?: Record<string, unknown> | undefined }> = {
      p2: {
        outputs: {
          '1': { images: [{ filename: '' }] },
          '2': { images: ['not-an-object'] },
          '3': { video: [null] }
        }
      }
    };

    expect(() => extractDeterministicOutputImage(history, 'p2')).toThrow(
      'No output images found for prompt p2.'
    );
  });

  it('given_missing_prompt_history_when_extracting_output_then_error_is_thrown', () => {
    expect(() => extractDeterministicOutputImage({}, 'unknown')).toThrow(
      'No history entry with outputs found for prompt unknown.'
    );
  });
});
