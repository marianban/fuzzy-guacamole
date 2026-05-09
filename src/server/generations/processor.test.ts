// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generationTelemetrySources,
  generationTelemetrySteps
} from '../../shared/generation-telemetry.js';
import type { Generation } from '../../shared/generations.js';
import type { ComfyHistoryProgressUpdate } from '../comfy/client.js';
import type { AppConfig } from '../config/app-config.js';
import type { AppRuntimeStatusService } from '../status/runtime-status.js';
import { createGenerationEventBus } from './events.js';
import type { GenerationExecutionPlan } from './execution/plan.js';
import { createStoredGeneration, type StoredGeneration } from './stored-generation.js';
import { createGenerationTelemetry } from './telemetry.js';
import { createGenerationProcessor } from './processor.js';

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
      telemetry: createTestTelemetry(),
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
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
        downloadImage
      },
      config: createTestConfig(root),
      runtimeStatus: createRuntimeStatusStub({
        ensureOnline: vi.fn(async () => undefined)
      }),
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
    expect(store.current.executionSnapshot).toMatchObject({
      workflow: {
        '12': {
          inputs: {
            image: inputPath
          }
        }
      }
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

  it('given_generation_processed_when_execution_advances_then_processor_publishes_ordered_telemetry_milestones', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'telemetry milestones',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );
    const eventBus = createGenerationEventBus();
    const telemetry = createGenerationTelemetry({
      eventBus,
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });
    telemetry.startRun(store.current.id);

    const telemetryEvents: {
      runId: string;
      sequence: number;
      kind: string;
      source: string;
      status?: string;
      step?: string;
    }[] = [];
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type !== 'telemetry' || event.generationId !== store.current.id) {
        return;
      }
      if (event.telemetry.kind === 'log') {
        return;
      }

      telemetryEvents.push({
        runId: event.runId,
        sequence: event.sequence,
        kind: event.telemetry.kind,
        source: event.telemetry.source,
        ...(event.telemetry.kind === 'progress'
          ? { step: event.telemetry.step }
          : event.telemetry.kind === 'milestone'
            ? {
                ...(event.telemetry.status !== undefined
                  ? { status: event.telemetry.status }
                  : {}),
                ...(event.telemetry.step !== undefined
                  ? { step: event.telemetry.step }
                  : {})
              }
            : {})
      });
    });

    const processor = createGenerationProcessor({
      store,
      telemetry,
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
        downloadImage: vi.fn(async () => Buffer.from([9, 8, 7]))
      },
      config: createTestConfig(root),
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });

    try {
      const result = await processor.process(store.current);

      expect(result).toEqual({ status: 'completed' });
      expect(telemetryEvents).toEqual([
        {
          runId: expect.any(String),
          sequence: 1,
          kind: 'milestone',
          source: generationTelemetrySources.processor,
          step: generationTelemetrySteps.promptRequestRecorded
        },
        {
          runId: expect.any(String),
          sequence: 2,
          kind: 'milestone',
          source: generationTelemetrySources.processor,
          step: generationTelemetrySteps.promptSubmitted
        },
        {
          runId: expect.any(String),
          sequence: 3,
          kind: 'milestone',
          source: generationTelemetrySources.processor,
          step: generationTelemetrySteps.outputStored
        }
      ]);
      expect(new Set(telemetryEvents.map((event) => event.runId)).size).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it('given_history_poll_reports_progress_when_generation_is_processed_then_processor_publishes_progress_telemetry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'telemetry progress',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );
    const eventBus = createGenerationEventBus();
    const telemetry = createGenerationTelemetry({
      eventBus,
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });
    telemetry.startRun(store.current.id);
    const progressEvents: {
      sequence: number;
      source: string;
      step: string;
      elapsedMs?: number;
    }[] = [];
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type !== 'telemetry' || event.generationId !== store.current.id) {
        return;
      }
      if (event.telemetry.kind !== 'progress') {
        return;
      }

      progressEvents.push({
        sequence: event.sequence,
        source: event.telemetry.source,
        step: event.telemetry.step,
        elapsedMs: event.telemetry.elapsedMs
      });
    });

    const processor = createGenerationProcessor({
      store,
      telemetry,
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(
          async (
            _promptId,
            options?: {
              onProgress?: (update: ComfyHistoryProgressUpdate) => void;
            }
          ) => {
            options?.onProgress?.({
              source: generationTelemetrySources.comfy,
              step: generationTelemetrySteps.waitingForHistory,
              promptId: 'prompt-1',
              elapsedMs: 25
            });
            return createCompletedPromptHistory();
          }
        ),
        downloadImage: vi.fn(async () => Buffer.from([9, 8, 7]))
      },
      config: createTestConfig(root),
      now: () => new Date('2026-04-07T10:15:16.000Z')
    });

    try {
      const result = await processor.process(store.current);

      expect(result).toEqual({ status: 'completed' });
      expect(progressEvents).toEqual([
        {
          sequence: expect.any(Number),
          source: generationTelemetrySources.comfy,
          step: generationTelemetrySteps.waitingForHistory,
          elapsedMs: 25
        }
      ]);
    } finally {
      unsubscribe();
    }
  });

  it('given_queued_random_seed_when_processed_then_submit_prompt_uses_the_stored_seed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'reuse queued seed',
          steps: 5,
          seedMode: 'random',
          seed: 8675309
        }
      })
    );
    const submitPrompt = vi.fn(async () => ({ promptId: 'prompt-1' }));

    const processor = createGenerationProcessor({
      store,
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt,
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
        downloadImage: vi.fn(async () => Buffer.from([9, 8, 7]))
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current);

    expect(result).toEqual({ status: 'completed' });
    expect(submitPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        '7': expect.objectContaining({
          inputs: expect.objectContaining({
            seed: 8675309
          })
        })
      }),
      expect.anything()
    );
  });

  it('given_stored_execution_snapshot_when_processed_then_processor_does_not_depend_on_preset_catalog', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const generation = {
      ...createTestGeneration({
        presetId: 'missing/basic',
        templateId: 'missing',
        presetParams: {
          prompt: 'queue snapshot',
          steps: 5,
          seedMode: 'random',
          seed: 8675309
        }
      }),
      executionSnapshot: {
        workflow: {
          '3': {
            class_type: 'SaveImage',
            inputs: {
              filename_prefix: 'result'
            }
          },
          '7': {
            class_type: 'KSampler',
            inputs: {
              seed: 8675309,
              steps: 5
            }
          },
          '14': {
            class_type: 'PromptNode',
            inputs: {
              prompt: 'queue snapshot'
            }
          }
        },
        resolvedParams: {
          prompt: 'queue snapshot',
          steps: 5,
          seedMode: 'random',
          seed: 8675309
        },
        preferredOutputNodeId: '3'
      }
    } as StoredGeneration & {
      executionSnapshot: GenerationExecutionPlan;
    };
    const store = createTestStore(generation as StoredGeneration);
    const submitPrompt = vi.fn(async () => ({ promptId: 'prompt-1' }));

    const processor = createGenerationProcessor({
      store,
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt,
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
        downloadImage: vi.fn(async () => Buffer.from([9, 8, 7]))
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(generation as StoredGeneration);

    expect(result).toEqual({ status: 'completed' });
    expect(submitPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        '7': expect.objectContaining({
          inputs: expect.objectContaining({
            seed: 8675309
          })
        })
      }),
      expect.anything()
    );
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
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage,
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
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
      telemetry: createTestTelemetry(),
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

  it('given_missing_preset_when_processed_then_processor_fails_with_preset_error', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        executionSnapshot: null
      })
    );

    const processor = createGenerationProcessor({
      store,
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => {
          throw new Error('should not submit');
        }),
        pollHistory: vi.fn(async () => {
          throw new Error('should not poll history');
        }),
        downloadImage: vi.fn(async () => {
          throw new Error('should not download');
        })
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current);

    expect(result).toEqual({
      status: 'failed',
      error:
        'Generation "11111111-1111-4111-8111-111111111111" is missing an execution snapshot.'
    });
  });

  it('given_readiness_gate_rejects_when_processed_then_generation_fails_before_comfy_calls_begin', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetParams: {
          prompt: 'manual startup required',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      })
    );
    const ensureOnline = vi.fn(async () => {
      throw new Error('ComfyUI startup has not been initiated.');
    });

    const processor = createGenerationProcessor({
      store,
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => {
          throw new Error('should not submit');
        }),
        pollHistory: vi.fn(async () => {
          throw new Error('should not poll history');
        }),
        downloadImage: vi.fn(async () => {
          throw new Error('should not download');
        })
      },
      config: createTestConfig(root),
      runtimeStatus: createRuntimeStatusStub({ ensureOnline })
    });

    const result = await processor.process({
      ...store.current,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic'
    });

    expect(result).toEqual({
      status: 'failed',
      error: 'ComfyUI startup has not been initiated.'
    });
    expect(ensureOnline).toHaveBeenCalledTimes(1);
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
      telemetry: createTestTelemetry(),
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
          return createCompletedPromptHistory();
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
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
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

  it('given_prompt_request_recording_returns_undefined_but_generation_is_still_submitted_when_processed_then_processor_fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-processor-'));
    tempDirs.push(root);

    const store = createTestStore(
      createTestGeneration({
        presetId: 'txt2img-basic/basic',
        templateId: 'txt2img-basic',
        presetParams: {
          prompt: 'record prompt request race',
          steps: 5,
          seedMode: 'fixed',
          seed: 123
        }
      }),
      {
        onRecordPromptRequest: async () => undefined
      }
    );

    const processor = createGenerationProcessor({
      store,
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => {
          throw new Error('should not submit prompt');
        }),
        pollHistory: vi.fn(async () => {
          throw new Error('should not poll history');
        }),
        downloadImage: vi.fn(async () => {
          throw new Error('should not download image');
        })
      },
      config: createTestConfig(root)
    });

    const result = await processor.process(store.current);

    expect(result).toEqual({
      status: 'failed',
      error:
        'Prompt request metadata could not be recorded because generation "11111111-1111-4111-8111-111111111111" remained in status "submitted".'
    });
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
      telemetry: createTestTelemetry(),
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
          return createCompletedPromptHistory();
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
      telemetry: createTestTelemetry(),
      comfyClient: {
        uploadInputImage: vi.fn(async () => {
          throw new Error('should not upload');
        }),
        submitPrompt: vi.fn(async () => ({ promptId: 'prompt-1' })),
        pollHistory: vi.fn(async () => createCompletedPromptHistory()),
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

function createCompletedPromptHistory(promptId = 'prompt-1') {
  const outputImage = {
    filename: 'remote.png',
    subfolder: 'output',
    type: 'output'
  };

  return {
    history: {
      [promptId]: {
        outputs: {
          '3': {
            images: [outputImage]
          }
        }
      }
    },
    entry: {
      outputs: {
        '3': {
          images: [outputImage]
        }
      }
    }
  };
}

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
  const { executionSnapshot, promptRequest, promptResponse, ...generationOverrides } =
    overrides;
  const generation: Generation = {
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
    ...generationOverrides
  };

  return createStoredGeneration(generation, {
    executionSnapshot:
      executionSnapshot === undefined
        ? createExecutionSnapshot(generation)
        : executionSnapshot,
    promptRequest: promptRequest ?? null,
    promptResponse: promptResponse ?? null
  });
}

function createExecutionSnapshot(
  generation: Pick<StoredGeneration, 'templateId' | 'presetParams'>
): GenerationExecutionPlan {
  const workflow: Record<string, unknown> = {
    '3': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'result'
      }
    },
    '7': {
      class_type: 'KSampler',
      inputs: {
        seed: generation.presetParams.seed,
        steps: generation.presetParams.steps
      }
    },
    '14': {
      class_type: 'PromptNode',
      inputs: {
        prompt: generation.presetParams.prompt
      }
    }
  };

  const inputImagePath = generation.presetParams.inputImagePath;
  if (
    generation.templateId === 'img2img-basic' &&
    typeof inputImagePath === 'string' &&
    inputImagePath.length > 0
  ) {
    workflow['12'] = {
      class_type: 'LoadImage',
      inputs: {
        image: inputImagePath
      }
    };
  }

  return {
    workflow,
    resolvedParams: structuredClone(generation.presetParams),
    ...(typeof inputImagePath === 'string' && inputImagePath.length > 0
      ? { inputImagePath }
      : {}),
    preferredOutputNodeId: '3'
  };
}

function createTestStore(
  initial: StoredGeneration,
  options: {
    onRecordPromptRequest?: (
      generationId: string,
      promptRequest: unknown,
      current: StoredGeneration
    ) => Promise<StoredGeneration | undefined>;
    onRecordPromptResponse?: (
      generationId: string,
      promptResponse: unknown,
      current: StoredGeneration
    ) => Promise<StoredGeneration | undefined>;
  } = {}
) {
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
      if (options.onRecordPromptRequest !== undefined) {
        return options.onRecordPromptRequest(generationId, promptRequest, state.current);
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
      if (options.onRecordPromptResponse !== undefined) {
        return options.onRecordPromptResponse(
          generationId,
          promptResponse,
          state.current
        );
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

function createRuntimeStatusStub(
  overrides: Partial<Pick<AppRuntimeStatusService, 'ensureOnline'>> = {}
): Pick<AppRuntimeStatusService, 'ensureOnline'> {
  return {
    ensureOnline: overrides.ensureOnline ?? (async () => undefined)
  };
}

function createTestTelemetry(now: () => Date = () => new Date()) {
  return createGenerationTelemetry({
    eventBus: createGenerationEventBus(),
    now
  });
}
