import type { FastifyBaseLogger } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config/app-config.js';
import {
  extractDeterministicOutputImage,
  setLoadImageReference,
  type ComfyOutputImage,
  type ComfyClient
} from '../comfy/client.js';
import type { AppRuntimeStatusService } from '../status/runtime-status.js';
import type { GenerationExecutionPlan } from './execution/plan.js';
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
  readonly #comfyClient: GenerationProcessorOptions['comfyClient'];
  readonly #config: Pick<AppConfig, 'paths' | 'timeouts'>;
  readonly #runtimeStatus: GenerationProcessorOptions['runtimeStatus'];
  readonly #logger: FastifyBaseLogger | undefined;
  readonly #now: () => Date;

  constructor(options: GenerationProcessorOptions) {
    this.#store = options.store;
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
      await this.#guardGenerationStep(generation.id, signal);
      await this.#runtimeStatus?.ensureOnline();
      throwIfAborted(signal);

      const execution = this.#loadExecutionSnapshot(generation);
      let workflow = execution.workflow;

      workflow = await this.#uploadInputImageIfPresent(
        generation.id,
        workflow,
        execution.inputImagePath,
        signal
      );
      await this.#recordPromptRequest(generation.id, workflow, signal);
      const promptResponse = await this.#submitPrompt(generation.id, workflow, signal);

      const historyResult = await this.#waitForHistory(
        generation.id,
        promptResponse.promptId,
        signal
      );

      const outputImage = extractDeterministicOutputImage(
        historyResult.history,
        promptResponse.promptId,
        execution.preferredOutputNodeId
      );

      await this.#downloadAndPersistOutput(
        generation.id,
        promptResponse.promptId,
        outputImage,
        signal
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

      if (error instanceof ExecutionSnapshotError) {
        return {
          status: 'failed',
          error: error.message
        };
      }

      if (error instanceof PromptExecutionError) {
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

  #loadExecutionSnapshot(generation: StoredGeneration): GenerationExecutionPlan {
    if (generation.executionSnapshot === null) {
      throw new ExecutionSnapshotError(
        `Generation "${generation.id}" is missing an execution snapshot.`
      );
    }

    return generation.executionSnapshot;
  }

  async #uploadInputImageIfPresent(
    generationId: string,
    workflow: Record<string, unknown>,
    inputImagePath: string | undefined,
    signal: AbortSignal | undefined
  ): Promise<Record<string, unknown>> {
    await this.#guardGenerationStep(generationId, signal);
    if (inputImagePath === undefined) {
      return workflow;
    }

    const upload = await this.#runWithTransientRetry('upload input image', async () =>
      this.#comfyClient.uploadInputImage(
        inputImagePath,
        signal !== undefined ? { signal } : {}
      )
    );
    return setLoadImageReference(workflow, upload.comfyImageRef);
  }

  async #recordPromptRequest(
    generationId: string,
    workflow: Record<string, unknown>,
    signal: AbortSignal | undefined
  ): Promise<void> {
    await this.#guardGenerationStep(generationId, signal);
    await this.#recordPromptMetadata({
      generationId,
      label: 'Prompt request',
      record: () =>
        this.#store.recordPromptRequest(generationId, {
          prompt: workflow
        })
    });
  }

  async #submitPrompt(
    generationId: string,
    workflow: Record<string, unknown>,
    signal: AbortSignal | undefined
  ): Promise<{ promptId: string; nodeErrors?: Record<string, unknown> }> {
    await this.#guardGenerationStep(generationId, signal);

    const promptResponse = await this.#runWithTransientRetry('submit prompt', async () =>
      this.#comfyClient.submitPrompt(workflow, signal !== undefined ? { signal } : {})
    );

    await this.#recordPromptMetadata({
      generationId,
      label: 'Prompt response',
      record: () => this.#store.recordPromptResponse(generationId, promptResponse)
    });

    this.#logger?.info(
      {
        generationId,
        promptId: promptResponse.promptId
      },
      'generation prompt submitted'
    );

    this.#throwIfPromptHasNodeErrors(promptResponse);

    return promptResponse;
  }

  #throwIfPromptHasNodeErrors(promptResponse: {
    promptId: string;
    nodeErrors?: Record<string, unknown>;
  }): void {
    if (
      promptResponse.nodeErrors === undefined ||
      Object.keys(promptResponse.nodeErrors).length === 0
    ) {
      return;
    }

    throw new PromptExecutionError(
      `Execution error: ${formatNodeErrors(promptResponse.nodeErrors)}`
    );
  }

  async #waitForHistory(
    generationId: string,
    promptId: string,
    signal: AbortSignal | undefined
  ) {
    await this.#guardGenerationStep(generationId, signal);

    return this.#runWithTransientRetry('poll prompt history', async () =>
      this.#comfyClient.pollHistory(promptId, {
        pollMs: this.#config.timeouts.historyPollMs,
        ...(signal !== undefined ? { signal } : {})
      })
    );
  }

  async #downloadAndPersistOutput(
    generationId: string,
    promptId: string,
    outputImage: ComfyOutputImage,
    signal: AbortSignal | undefined
  ): Promise<void> {
    await this.#guardGenerationStep(generationId, signal);
    const imageBytes = await this.#comfyClient.downloadImage(
      outputImage,
      signal !== undefined ? { signal } : {}
    );

    await this.#guardGenerationStep(generationId, signal);
    const outputPath = await this.#persistOutput(
      generationId,
      outputImage.filename,
      imageBytes
    );

    this.#logger?.info(
      {
        generationId,
        promptId,
        outputPath
      },
      'generation output stored'
    );
  }

  async #recordPromptMetadata(options: {
    generationId: string;
    label: 'Prompt request' | 'Prompt response';
    record: () => Promise<StoredGeneration | undefined>;
  }): Promise<void> {
    const recorded = await options.record();
    if (recorded !== undefined) {
      return;
    }

    const current = await this.#store.getStoredById(options.generationId);
    if (current?.status === 'canceled') {
      throw new CanceledGenerationError();
    }

    if (current === undefined) {
      throw new PromptMetadataPersistenceError(
        `${options.label} metadata could not be recorded because generation "${options.generationId}" no longer exists.`
      );
    }

    throw new PromptMetadataPersistenceError(
      `${options.label} metadata could not be recorded because generation "${options.generationId}" remained in status "${current.status}".`
    );
  }

  async #guardGenerationStep(generationId: string, signal?: AbortSignal): Promise<void> {
    await this.#ensureGenerationActive(generationId);
    throwIfAborted(signal);
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

class PromptMetadataPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptMetadataPersistenceError';
  }
}

class ExecutionSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionSnapshotError';
  }
}

class PromptExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptExecutionError';
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
  if (error instanceof ExecutionSnapshotError) {
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
