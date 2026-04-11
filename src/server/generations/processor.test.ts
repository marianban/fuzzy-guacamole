// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config/app-config.js';
import { createStoredGeneration, type StoredGeneration } from './stored-generation.js';
import { createGenerationProcessor } from './processor.js';
import { createPresetCatalog } from '../presets/preset-catalog.js';

describe('createGenerationProcessor', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_img2img_generation_when_processed_then_prompt_metadata_is_persisted_and_output_is_saved', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);
    const inputPath = path.join(root, 'input.png');
    await writeFile(inputPath, Buffer.from([1, 2, 3, 4]));

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'storybook',
          steps: 5,
          seedMode: 'fixed',
          seed: 123,
          inputImagePath: inputPath
        }
      })
    );
    const submitPrompt = vi.fn(async (workflow: Record<string, unknown>) => ({
      promptId: 'prompt-1',
      workflow
    }));
    const downloadImage = vi.fn(async () => Buffer.from([9, 8, 7]));

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary()],
        new Map([[createPresetDetail().id, createPresetDetail()]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => ({
          comfyImageRef: 'input/uploaded.png',
          image: {
            filename: 'uploaded.png',
            subfolder: 'input',
            type: 'input'
          }
        })),
        submitPrompt,
        pollHistory: vi.fn(async () => ({
          history: {
            'prompt-1': {
              outputs: {
                '3': {
                  images: [
                    {
                      filename: 'remote.png',
                      subfolder: 'output',
                      type: 'output'
                    }
                  ]
                }
              }
            }
          },
          entry: {
            outputs: {
              '3': {
                images: [
                  {
                    filename: 'remote.png',
                    subfolder: 'output',
                    type: 'output'
                  }
                ]
              }
            }
          }
        })),
        downloadImage
      },
      config: createTestConfig(root),
      readiness: {
        ensureReady: vi.fn(async () => undefined)
      },
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });

    const result = await processor.process(store.current);

    expect(result).toEqual({ status: 'completed' });
    expect(store.promptRequest).toMatchObject({
      prompt: {
        '12': {
          inputs: {
            image: 'input/uploaded.png'
          }
        }
      }
    });
    expect(store.promptResponse).toMatchObject({
      promptId: 'prompt-1'
    });

    const outputDir = path.join(root, 'outputs', store.current.id);
    const outputFiles = await readdir(outputDir);
    expect(outputFiles).toHaveLength(1);
    expect(outputFiles[0]).toMatch(/^2026-04-07T10-15-16-000Z-/);
    const outputBytes = await readFile(path.join(outputDir, outputFiles[0] ?? 'missing'));
    expect(outputBytes.equals(Buffer.from([9, 8, 7]))).toBe(true);
    expect(submitPrompt).toHaveBeenCalledTimes(1);
    expect(downloadImage).toHaveBeenCalledTimes(1);
  });

  it('given_transient_upload_failure_when_processed_then_upload_is_retried_once', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);
    const inputPath = path.join(root, 'input.png');
    await writeFile(inputPath, Buffer.from([1, 2, 3, 4]));

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'retry upload',
          steps: 5,
          seedMode: 'fixed',
          seed: 123,
          inputImagePath: inputPath
        }
      })
    );
    const uploadInputImage = vi
      .fn<
        (filePath: string) => Promise<{
          comfyImageRef: string;
          image: { filename: string; subfolder?: string; type?: string };
        }>
      >()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue({
        comfyImageRef: 'input/uploaded.png',
        image: {
          filename: 'uploaded.png',
          subfolder: 'input',
          type: 'input'
        }
      });

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary()],
        new Map([[createPresetDetail().id, createPresetDetail()]])
      ),
      comfyClient: {
        uploadInputImage,
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => ({
          history: {
            'prompt-1': {
              outputs: {
                '3': {
                  images: [
                    { filename: 'remote.png', subfolder: 'output', type: 'output' }
                  ]
                }
              }
            }
          },
          entry: {
            outputs: {
              '3': {
                images: [{ filename: 'remote.png', subfolder: 'output', type: 'output' }]
              }
            }
          }
        })),
        downloadImage: vi.fn(async () => Buffer.from([1, 2, 3]))
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current);

    expect(result).toEqual({ status: 'completed' });
    expect(uploadInputImage).toHaveBeenCalledTimes(2);
  });

  it('given_submit_node_errors_when_processed_then_failure_is_terminal_without_retry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'node error',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );
    const submitPrompt = vi.fn(async () => ({
      promptId: 'prompt-1',
      nodeErrors: {
        '7': 'invalid sampler inputs'
      }
    }));

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary()],
        new Map([[createPresetDetail('txt2img').id, createPresetDetail('txt2img')]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt,
        pollHistory: vi.fn(async () => {
          throw new Error('should not poll history');
        }),
        downloadImage: vi.fn(async () => {
          throw new Error('should not download image');
        })
      },
      config: createTestConfig(root)
    });

    const result = await processor.process({
      ...store.current,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic'
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/invalid sampler inputs/i)
    });
    expect(submitPrompt).toHaveBeenCalledTimes(1);
  });

  it('given_generation_is_canceled_during_execution_when_processed_then_processor_returns_canceled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'cancel me',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );
    const downloadImage = vi.fn(async () => Buffer.from([9, 8, 7]));

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary('txt2img')],
        new Map([[createPresetDetail('txt2img').id, createPresetDetail('txt2img')]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => {
          store.current = {
            ...store.current,
            status: 'canceled'
          };
          return {
            history: {
              'prompt-1': {
                outputs: {
                  '3': {
                    images: [
                      { filename: 'remote.png', subfolder: 'output', type: 'output' }
                    ]
                  }
                }
              }
            },
            entry: {
              outputs: {
                '3': {
                  images: [
                    { filename: 'remote.png', subfolder: 'output', type: 'output' }
                  ]
                }
              }
            }
          };
        }),
        downloadImage
      },
      config: createTestConfig(root)
    });

    const result = await processor.process({
      ...store.current,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic'
    });

    expect(result).toEqual({ status: 'canceled' });
    expect(downloadImage).not.toHaveBeenCalled();
  });

  it('given_generation_is_canceled_after_download_when_processed_then_output_is_not_persisted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'cancel after download',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary('txt2img')],
        new Map([[createPresetDetail('txt2img').id, createPresetDetail('txt2img')]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => ({
          history: {
            'prompt-1': {
              outputs: {
                '3': {
                  images: [
                    { filename: 'remote.png', subfolder: 'output', type: 'output' }
                  ]
                }
              }
            }
          },
          entry: {
            outputs: {
              '3': {
                images: [{ filename: 'remote.png', subfolder: 'output', type: 'output' }]
              }
            }
          }
        })),
        downloadImage: vi.fn(async () => {
          store.current = {
            ...store.current,
            status: 'canceled'
          };
          return Buffer.from([9, 8, 7]);
        })
      },
      config: createTestConfig(root)
    });

    const result = await processor.process({
      ...store.current,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic'
    });

    expect(result).toEqual({ status: 'canceled' });
    await expect(readdir(path.join(root, 'outputs', store.current.id))).rejects.toThrow();
  });

  it('given_abort_signal_when_processing_generation_then_comfy_client_calls_receive_the_same_signal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);
    const receivedSignals: AbortSignal[] = [];
    const signal = new AbortController().signal;

    const store = createTestStore(
      createTestGeneration({
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'abort signal',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary('txt2img')],
        new Map([[createPresetDetail('txt2img').id, createPresetDetail('txt2img')]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async (_workflow, options) => {
          receivedSignals.push(options?.signal as AbortSignal);
          return { promptId: 'prompt-1' };
        }),
        pollHistory: vi.fn(async (_promptId, options) => {
          receivedSignals.push(options?.signal as AbortSignal);
          return {
            history: {
              'prompt-1': {
                outputs: {
                  '3': {
                    images: [
                      { filename: 'remote.png', subfolder: 'output', type: 'output' }
                    ]
                  }
                }
              }
            },
            entry: {
              outputs: {
                '3': {
                  images: [
                    { filename: 'remote.png', subfolder: 'output', type: 'output' }
                  ]
                }
              }
            }
          };
        }),
        downloadImage: vi.fn(async (_image, options) => {
          receivedSignals.push(options?.signal as AbortSignal);
          return Buffer.from([9, 8, 7]);
        })
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current, signal);

    expect(result).toEqual({ status: 'completed' });
    expect(receivedSignals).toEqual([signal, signal, signal]);
  });

  it('given_invalid_generation_id_when_output_is_persisted_then_processor_fails_without_writing_outside_output_root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        id: '../escaped-output',
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'bad id',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );

    const processor = createGenerationProcessor({
      store,
      presetCatalog: createPresetCatalog(
        [createPresetSummary('txt2img')],
        new Map([[createPresetDetail('txt2img').id, createPresetDetail('txt2img')]])
      ),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => ({
          history: {
            'prompt-1': {
              outputs: {
                '3': {
                  images: [
                    { filename: 'remote.png', subfolder: 'output', type: 'output' }
                  ]
                }
              }
            }
          },
          entry: {
            outputs: {
              '3': {
                images: [{ filename: 'remote.png', subfolder: 'output', type: 'output' }]
              }
            }
          }
        })),
        downloadImage: vi.fn(async () => Buffer.from([9, 8, 7]))
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current);

    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/invalid generation id/i)
    });
    await expect(readdir(path.join(root, 'outputs'))).rejects.toThrow();
    await expect(stat(path.join(root, 'escaped-output'))).rejects.toThrow();
  });
});

function createTestConfig(root: string): AppConfig {
  return {
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
      presets: path.join(root, 'presets'),
      inputs: path.join(root, 'inputs'),
      outputs: path.join(root, 'outputs')
    },
    timeouts: {
      pcBootMs: 1000,
      sshPollMs: 1000,
      comfyBootMs: 1000,
      healthPollMs: 1000,
      historyPollMs: 10,
      submittedTimeoutMs: 900000
    }
  };
}

function createTestGeneration(
  overrides: Partial<StoredGeneration> = {}
): StoredGeneration {
  return createStoredGeneration({
    id: '11111111-1111-4111-8111-111111111111',
    status: 'submitted',
    presetId: 'img2img-basic/basic',
    templateId: 'img2img-basic',
    presetParams: {
      prompt: 'storybook',
      steps: 5,
      seedMode: 'fixed',
      seed: 123,
      ...(overrides.presetParams ?? {})
    },
    queuedAt: '2026-04-07T10:00:00.000Z',
    error: null,
    createdAt: '2026-04-07T09:59:00.000Z',
    updatedAt: '2026-04-07T10:00:00.000Z',
    ...overrides
  });
}

function createTestStore(initial: StoredGeneration) {
  const state = {
    current: initial,
    promptRequest: null as unknown,
    promptResponse: null as unknown
  };

  return {
    get current() {
      return state.current;
    },
    set current(value: StoredGeneration) {
      state.current = value;
    },
    get promptRequest() {
      return state.promptRequest;
    },
    get promptResponse() {
      return state.promptResponse;
    },
    async getStoredById(generationId: string) {
      return generationId === state.current.id ? state.current : undefined;
    },
    async recordPromptRequest(generationId: string, promptRequest: unknown) {
      if (generationId !== state.current.id) {
        return undefined;
      }
      state.promptRequest = promptRequest;
      state.current = {
        ...state.current,
        promptRequest
      };
      return state.current;
    },
    async recordPromptResponse(generationId: string, promptResponse: unknown) {
      if (generationId !== state.current.id) {
        return undefined;
      }
      state.promptResponse = promptResponse;
      state.current = {
        ...state.current,
        promptResponse
      };
      return state.current;
    }
  };
}

function createPresetSummary(type: 'img2img' | 'txt2img' = 'img2img') {
  return {
    id: `${type}-basic/basic`,
    name: `${type} basic`,
    type,
    templateId: `${type}-basic`,
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt',
      steps: 5,
      seedMode: 'random'
    }
  };
}

function createPresetDetail(type: 'img2img' | 'txt2img' = 'img2img') {
  const summary = createPresetSummary(type);
  return {
    ...summary,
    model: {
      categories: [
        {
          id: 'main',
          label: { en: 'Main' },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        },
        {
          id: 'advanced',
          label: { en: 'Advanced' },
          order: 20,
          presentation: {
            collapsible: true,
            defaultExpanded: false
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: { en: 'Prompt' },
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const
          }
        },
        {
          id: 'steps',
          fieldType: 'integer' as const,
          categoryId: 'advanced',
          order: 20,
          label: { en: 'Steps' },
          default: 5,
          validation: {
            required: true,
            min: 1,
            max: 100
          },
          control: {
            type: 'slider' as const,
            min: 1,
            max: 100,
            step: 1
          }
        },
        {
          id: 'seedMode',
          fieldType: 'enum' as const,
          categoryId: 'advanced',
          order: 30,
          label: { en: 'Seed Mode' },
          default: 'random',
          validation: {
            required: true
          },
          control: {
            type: 'select' as const,
            options: [
              { value: 'random', label: { en: 'Random' } },
              { value: 'fixed', label: { en: 'Fixed' } }
            ]
          }
        },
        {
          id: 'seed',
          fieldType: 'integer' as const,
          categoryId: 'advanced',
          order: 40,
          label: { en: 'Seed' },
          validation: {
            required: false,
            min: 0
          },
          visibility: {
            field: 'seedMode',
            equals: 'fixed'
          },
          control: {
            type: 'input' as const
          }
        }
      ]
    },
    template: {
      id: summary.templateId,
      type,
      workflow:
        type === 'img2img'
          ? {
              '12': {
                class_type: 'LoadImage',
                inputs: {
                  image: '{{inputImagePath}}'
                }
              },
              '14': {
                class_type: 'PromptNode',
                inputs: {
                  prompt: '{{prompt}}'
                }
              },
              '7': {
                class_type: 'KSampler',
                inputs: {
                  seed: '{{seed}}',
                  steps: '{{steps}}'
                }
              },
              '3': {
                class_type: 'SaveImage',
                inputs: {
                  filename_prefix: 'result'
                }
              }
            }
          : {
              '14': {
                class_type: 'PromptNode',
                inputs: {
                  prompt: '{{prompt}}'
                }
              },
              '7': {
                class_type: 'KSampler',
                inputs: {
                  seed: '{{seed}}',
                  steps: '{{steps}}'
                }
              },
              '3': {
                class_type: 'SaveImage',
                inputs: {
                  filename_prefix: 'result'
                }
              }
            }
    }
  };
}
