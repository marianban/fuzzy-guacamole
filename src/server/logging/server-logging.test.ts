// @vitest-environment node

import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { buildServer } from '../http/server-app.js';
import { loadAppConfig } from '../config/app-config.js';
import type { GenerationStore } from '../generations/store.js';
import { createPresetCatalog } from '../presets/preset-catalog.js';
import { createBuildServerOptions } from '../test-support/build-server-options.js';
import { generationSchema, type Generation } from '../../shared/generations.js';

type LogEntry = Record<string, unknown> & {
  body?: Record<string, unknown>;
  err?: {
    message?: string;
  };
  generationId?: string;
  inputImagePath?: string;
  level?: number;
  method?: string;
  msg?: string;
  presetId?: string;
  responseTimeMs?: number;
  route?: string;
  statusCode?: number;
  templateId?: string;
  warningCode?: string;
};

describe.sequential('server logging', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true }))
    );
  });

  test('given_generation_creation_when_request_completes_then_logs_timing_and_generation_reference', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-logging-'));
    tempDirs.push(tempDir);
    const logs = createLogCollector();
    const app = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        logger: {
          level: 'info',
          stream: logs.stream
        }
      })
    );

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'logging test prompt'
          }
        }
      });

      expect(response.statusCode).toBe(201);
      await logs.flush();

      const generation = generationSchema.parse(response.json());
      const entries = logs.readEntries();

      expect(entries).toContainEqual(
        expect.objectContaining({
          msg: 'generation created',
          generationId: generation.id,
          presetId: 'img2img-basic/basic',
          templateId: 'img2img-basic'
        })
      );
      expect(entries).toContainEqual(
        expect.objectContaining({
          msg: 'request completed',
          method: 'POST',
          route: '/api/generations',
          statusCode: 201,
          body: expect.objectContaining({
            presetId: 'img2img-basic/basic',
            presetParamKeys: ['prompt']
          }),
          responseTimeMs: expect.any(Number)
        })
      );
    } finally {
      await app.close();
    }
  });

  test('given_input_upload_when_file_is_stored_then_logs_generation_and_input_path_reference', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-logging-'));
    tempDirs.push(tempDir);
    const logs = createLogCollector();
    const app = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        logger: {
          level: 'info',
          stream: logs.stream
        }
      })
    );

    try {
      const generation = await createGenerationWithInject(app);
      const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const multipart = buildMultipartPayload('source.png', fileBuffer);

      const uploadResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${generation.id}/input`,
        headers: {
          'content-type': `multipart/form-data; boundary=${multipart.boundary}`
        },
        payload: multipart.payload
      });

      expect(uploadResponse.statusCode).toBe(204);

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/generations/${generation.id}`
      });
      const detail = generationSchema.parse(detailResponse.json());
      const inputImagePath = z.string().parse(detail.presetParams.inputImagePath);

      await logs.flush();

      expect(logs.readEntries()).toContainEqual(
        expect.objectContaining({
          msg: 'generation input stored',
          generationId: generation.id,
          inputImagePath
        })
      );
      await expect(readFile(inputImagePath)).resolves.toEqual(fileBuffer);
    } finally {
      await app.close();
    }
  });

  test('given_missing_generation_when_queueing_then_logs_warning_with_generation_reference', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-logging-'));
    tempDirs.push(tempDir);
    const logs = createLogCollector();
    const app = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        logger: {
          level: 'info',
          stream: logs.stream
        }
      })
    );

    try {
      const generationId = '11111111-1111-4111-8111-111111111111';
      const response = await app.inject({
        method: 'POST',
        url: `/api/generations/${generationId}/queue`
      });

      expect(response.statusCode).toBe(404);
      await logs.flush();

      expect(logs.readEntries()).toContainEqual(
        expect.objectContaining({
          msg: 'generation queue rejected',
          generationId,
          warningCode: 'generation_not_found'
        })
      );
    } finally {
      await app.close();
    }
  });

  test('given_store_failure_when_creating_generation_then_logs_exception_details', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-logging-'));
    tempDirs.push(tempDir);
    const logs = createLogCollector();
    const app = buildServer(
      createBuildServerOptions({
        config: await loadTestConfig(tempDir),
        presetCatalog: createTestCatalog(),
        generationStore: createFailingGenerationStore(),
        logger: {
          level: 'info',
          stream: logs.stream
        }
      })
    );

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'logging failure prompt'
          }
        }
      });

      expect(response.statusCode).toBe(500);
      await logs.flush();

      const errorLog = logs.readEntries().find((entry) => entry.msg === 'request failed');

      expect(errorLog).toEqual(
        expect.objectContaining({
          method: 'POST',
          route: '/api/generations'
        })
      );
      expect(errorLog?.err?.message).toContain('generation store unavailable');
    } finally {
      await app.close();
    }
  });
});

function createLogCollector() {
  const stream = new PassThrough();
  let buffer = '';
  const entries: LogEntry[] = [];

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }

      entries.push(JSON.parse(line) as LogEntry);
    }
  });

  return {
    stream,
    readEntries: () => [...entries],
    flush: async () => {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

function createFailingGenerationStore(): GenerationStore {
  return {
    async create() {
      throw new Error('generation store unavailable');
    },
    async list() {
      return [];
    },
    async getById() {
      return undefined;
    },
    async getStoredById() {
      return undefined;
    },
    async save(generation: Generation) {
      return generation;
    },
    async deleteDeletable() {
      return false;
    },
    async setInputImagePath() {
      return undefined;
    },
    async markQueued(_generationId, _options) {
      return undefined;
    },
    async claimNextQueued() {
      return undefined;
    },
    async recordPromptRequest() {
      return undefined;
    },
    async recordPromptResponse() {
      return undefined;
    },
    async markCanceled() {
      return undefined;
    },
    async markCompleted() {
      return undefined;
    },
    async markFailed() {
      return undefined;
    },
    async failSubmittedOnStartup() {
      return [];
    },
    async failStaleSubmittedBefore() {
      return [];
    },
    async delete() {
      return false;
    }
  } satisfies GenerationStore;
}

async function createGenerationWithInject(
  app: ReturnType<typeof buildServer>
): Promise<Generation> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/generations',
    payload: {
      presetId: 'img2img-basic/basic',
      presetParams: {
        prompt: 'integration test'
      }
    }
  });

  expect(response.statusCode).toBe(201);
  return generationSchema.parse(response.json());
}

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
          historyPollMs: 1_000,
          submittedTimeoutMs: 900_000
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}

function createTestCatalog() {
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
    model: {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: 'default prompt',
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const,
            multiline: true,
            rows: 4
          }
        }
      ]
    },
    template: {
      id: 'img2img-basic',
      type: 'img2img' as const,
      implicitRuntimeParamKeys: [],
      workflow: {
        '1': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
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
