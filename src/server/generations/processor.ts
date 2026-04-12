import type { FastifyBaseLogger } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config/app-config.js';
import {
  extractDeterministicOutputImage,
  setLoadImageReference,
  type ComfyClient
} from '../comfy/client.js';
import type { AppRuntimeStatusService } from '../status/runtime-status.js';
import type { PresetCatalog } from '../presets/preset-catalog.js';
import {
  buildGenerationExecution,
  GenerationExecutionValidationError
} from './execution/builder.js';
import { resolveGenerationArtifactPath } from './artifact-paths.js';
import type { StoredGeneration } from './stored-generation.js';
import type { GenerationStore } from './store.js';

export type GenerationProcessResult =
  | {
      status: 'completed';
    }
  | {
      status: 'canceled';
    }
  | {
      status: 'failed';
      error: string;
    };

export interface GenerationProcessor {
  process(
    generation: StoredGeneration,
    signal?: AbortSignal
  ): Promise<GenerationProcessResult>;
}

export interface GenerationProcessorOptions {
  store: Pick<
    GenerationStore,
    'getStoredById' | 'recordPromptRequest' | 'recordPromptResponse'
  >;
  presetCatalog: PresetCatalog;
  comfyClient: Pick<
    ComfyClient,
    'uploadInputImage' | 'submitPrompt' | 'pollHistory' | 'downloadImage'
  >;
  config: Pick<AppConfig, 'paths' | 'timeouts'>;
  runtimeStatus?: Pick<AppRuntimeStatusService, 'ensureOnline'>;
  logger?: FastifyBaseLogger;
  now?: () => Date;
}

export function createPlaceholderGenerationProcessor(): GenerationProcessor {
  return {
    async process() {
      return {
        status: 'failed',
        error: 'Generation execution is not implemented yet.'
      };
    }
  };
}

export function createGenerationProcessor(
  options: GenerationProcessorOptions
): GenerationProcessor {
  return new DefaultGenerationProcessor(options);
}

class DefaultGenerationProcessor implements GenerationProcessor {
  readonly #store: GenerationProcessorOptions['store'];
  readonly #presetCatalog: PresetCatalog;
  readonly #comfyClient: GenerationProcessorOptions['comfyClient'];
  readonly #config: Pick<AppConfig, 'paths' | 'timeouts'>;
  readonly #runtimeStatus: GenerationProcessorOptions['runtimeStatus'];
  readonly #logger: FastifyBaseLogger | undefined;
  readonly #now: () => Date;

  constructor(options: GenerationProcessorOptions) {
    this.#store = options.store;
    this.#presetCatalog = options.presetCatalog;
    this.#comfyClient = options.comfyClient;
    this.#config = options.config;
    this.#runtimeStatus = options.runtimeStatus;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
  }

  async process(
    generation: StoredGeneration,
    signal?: AbortSignal
  ): Promise<GenerationProcessResult> {
    try {
      throwIfAborted(signal);
      await this.#ensureGenerationActive(generation.id);
      await this.#runtimeStatus?.ensureOnline();
      throwIfAborted(signal);

      const preset = this.#presetCatalog.getById(generation.presetId);
      if (preset === undefined) {
        return {
          status: 'failed',
          error: `Preset "${generation.presetId}" was not found.`
        };
      }

      const execution = buildGenerationExecution({
        generation,
        preset
      });

      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);

      if (execution.inputImagePath !== undefined) {
        const upload = await this.#runWithTransientRetry('upload input image', async () =>
          this.#comfyClient.uploadInputImage(
            execution.inputImagePath as string,
            signal !== undefined ? { signal } : {}
          )
        );
        setLoadImageReference(execution.workflow, upload.comfyImageRef);
      }

      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);

      const promptRequest = {
        prompt: execution.workflow
      };
      const recordedPromptRequest = await this.#store.recordPromptRequest(
        generation.id,
        promptRequest
      );
      if (recordedPromptRequest === undefined) {
        return { status: 'canceled' };
      }

      const promptResponse = await this.#runWithTransientRetry(
        'submit prompt',
        async () =>
          this.#comfyClient.submitPrompt(
            execution.workflow,
            signal !== undefined ? { signal } : {}
          )
      );
      const recordedPromptResponse = await this.#store.recordPromptResponse(
        generation.id,
        promptResponse
      );
      if (recordedPromptResponse === undefined) {
        return { status: 'canceled' };
      }

      this.#logger?.info(
        {
          generationId: generation.id,
          promptId: promptResponse.promptId
        },
        'generation prompt submitted'
      );

      if (
        promptResponse.nodeErrors !== undefined &&
        Object.keys(promptResponse.nodeErrors).length > 0
      ) {
        return {
          status: 'failed',
          error: `Execution error: ${formatNodeErrors(promptResponse.nodeErrors)}`
        };
      }

      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);

      const historyResult = await this.#runWithTransientRetry(
        'poll prompt history',
        async () =>
          this.#comfyClient.pollHistory(promptResponse.promptId, {
            pollMs: this.#config.timeouts.historyPollMs,
            ...(signal !== undefined ? { signal } : {})
          })
      );

      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);

      const outputImage = extractDeterministicOutputImage(
        historyResult.history,
        promptResponse.promptId,
        execution.preferredOutputNodeId
      );

      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);

      const imageBytes = await this.#comfyClient.downloadImage(
        outputImage,
        signal !== undefined ? { signal } : {}
      );
      await this.#ensureGenerationActive(generation.id);
      throwIfAborted(signal);
      const outputPath = await this.#persistOutput(
        generation.id,
        outputImage.filename,
        imageBytes
      );

      this.#logger?.info(
        {
          generationId: generation.id,
          promptId: promptResponse.promptId,
          outputPath
        },
        'generation output stored'
      );

      return {
        status: 'completed'
      };
    } catch (error) {
      if (error instanceof CanceledGenerationError) {
        return {
          status: 'canceled'
        };
      }

      if (isAbortError(error)) {
        return {
          status: 'canceled'
        };
      }

      if (error instanceof GenerationExecutionValidationError) {
        return {
          status: 'failed',
          error: error.message
        };
      }

      this.#logger?.error(
        {
          err: error,
          generationId: generation.id
        },
        'generation execution failed'
      );

      return {
        status: 'failed',
        error: normalizeErrorMessage(error)
      };
    }
  }

  async #ensureGenerationActive(generationId: string): Promise<void> {
    const current = await this.#store.getStoredById(generationId);
    if (current === undefined || current.status !== 'submitted') {
      throw new CanceledGenerationError();
    }
  }

  async #runWithTransientRetry<T>(
    label: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (!isTransientExecutionError(error)) {
        throw error;
      }

      this.#logger?.warn(
        {
          err: error,
          operation: label
        },
        'retrying transient generation execution failure'
      );
      return operation();
    }
  }

  async #persistOutput(
    generationId: string,
    originalFilename: string,
    imageBytes: Buffer
  ): Promise<string> {
    const outputDir = resolveGenerationArtifactPath(
      this.#config.paths.outputs,
      generationId
    );
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(
      outputDir,
      `${formatTimestampForFileName(this.#now())}-${sanitizeFileName(originalFilename)}`
    );
    await writeFile(outputPath, imageBytes);
    return outputPath;
  }
}

class CanceledGenerationError extends Error {
  constructor() {
    super('Generation execution was canceled.');
    this.name = 'CanceledGenerationError';
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new CanceledGenerationError();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isTransientExecutionError(error: unknown): boolean {
  if (error instanceof GenerationExecutionValidationError) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = normalizeErrorMessage(error);
  if (/history timeout/i.test(message)) {
    return false;
  }

  return /(fetch failed|network|econn|etimedout|timed out|timeout|socket hang up)/i.test(
    message
  );
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatNodeErrors(nodeErrors: Record<string, unknown>): string {
  return Object.entries(nodeErrors)
    .map(([nodeId, detail]) => `${nodeId}: ${formatNodeErrorDetail(detail)}`)
    .join('; ');
}

function formatNodeErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') {
    return detail;
  }

  return JSON.stringify(detail);
}

function sanitizeFileName(filename: string): string {
  return path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_');
}

function formatTimestampForFileName(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-');
}
