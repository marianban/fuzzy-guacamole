// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { createPresetCatalog } from './presets.js';

async function loadTestConfig(root: string) {
  const configPath = path.join(root, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        comfyBaseUrl: 'http://127.0.0.1:8188',
        ssh: {
          host: '127.0.0.1',
          port: 22,
          username: 'user',
          privateKeyPath: '/tmp/id'
        },
        remoteStart: {
          startComfyCommand: 'echo start'
        },
        wol: {
          mac: 'AA:BB:CC:DD:EE:FF',
          broadcast: '192.168.0.255',
          port: 9
        },
        paths: {
          presets: '/tmp/presets',
          inputs: root,
          outputs: '/tmp/outputs'
        },
        timeouts: {
          pcBootMs: 1_000,
          sshPollMs: 1_000,
          comfyBootMs: 1_000,
          healthPollMs: 1_000,
          historyPollMs: 1_000
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}

function createCatalog() {
  const summary = {
    id: 'img2img-basic/basic',
    name: 'Img2Img - Basic',
    type: 'img2img' as const,
    templateId: 'img2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt'
    }
  };

  const detail = {
    ...summary,
    template: {
      id: 'img2img-basic',
      type: 'img2img' as const,
      workflow: {
        '1': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{PROMPT}}' }
        }
      },
      placeholders: {
        '{{PROMPT}}': 'prompt'
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function buildMultipartPayload(fileName: string, fileContent: Buffer) {
  const boundary = '----fg-test-boundary';
  const start = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      'Content-Type: image/png\r\n\r\n',
    'utf8'
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    payload: Buffer.concat([start, fileContent, end])
  };
}

describe('generation routes', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_created_generation_when_listing_and_loading_detail_then_generation_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'hello'
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      id: string;
      status: string;
      presetId: string;
      templateId: string;
      queuedAt: string | null;
    };
    expect(created.status).toBe('draft');
    expect(created.presetId).toBe('img2img-basic/basic');
    expect(created.templateId).toBe('img2img-basic');
    expect(created.queuedAt).toBeNull();

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/generations'
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: created.id,
      status: 'draft'
    });

    await app.close();
  });

  it('given_draft_generation_when_queued_then_status_and_queue_time_are_set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'queue me'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const queueResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/queue`
    });
    expect(queueResponse.statusCode).toBe(200);
    expect(queueResponse.json()).toMatchObject({
      id: created.id,
      status: 'queued'
    });
    expect(queueResponse.json()).toEqual(
      expect.objectContaining({
        queuedAt: expect.any(String)
      })
    );

    await app.close();
  });

  it('given_queued_generation_when_canceled_then_status_becomes_canceled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'cancel me'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/queue`
    });

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/cancel`
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({
      id: created.id,
      status: 'canceled'
    });

    await app.close();
  });

  it('given_generation_when_input_uploaded_then_file_is_saved_and_reference_is_persisted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'with input'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const multipart = buildMultipartPayload('input.png', fileBuffer);

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/input`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`
      },
      payload: multipart.payload
    });
    expect(uploadResponse.statusCode).toBe(204);
    expect(uploadResponse.body).toBe('');
    expect(uploadResponse.headers['content-type']).toBeUndefined();

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as {
      presetParams: {
        inputImagePath: string;
      };
    };
    expect(detail.presetParams.inputImagePath).toContain(`${created.id}`);
    expect(detail.presetParams.inputImagePath).toContain('original');

    const savedContent = await readFile(detail.presetParams.inputImagePath);
    expect(savedContent.equals(fileBuffer)).toBe(true);

    await app.close();
  });
});
