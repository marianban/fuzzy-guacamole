import type { FastifyBaseLogger } from 'fastify';

import type { Generation } from '../../shared/generations.js';
import { generationTelemetrySources } from '../../shared/generation-telemetry.js';
import type { GenerationEventBus } from './events.js';
import type { GenerationProcessor, GenerationProcessResult } from './processor.js';
import type { StoredGeneration } from './stored-generation.js';
import type { GenerationStore } from './store.js';
import type { GenerationTelemetry } from './telemetry.js';

const startupRecoveryError =
  'Generation processing was interrupted during server shutdown.';
const staleSubmittedRecoveryError =
  'Generation processing timed out while waiting in submitted state.';

export interface GenerationWorkerOptions {
  eventBus: GenerationEventBus;
  telemetry: GenerationTelemetry;
  store: GenerationStore;
  processor: GenerationProcessor;
  pollIntervalMs: number;
  submittedTimeoutMs: number;
  logger?: FastifyBaseLogger;
  now: () => Date;
}

export interface GenerationWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  wake(): void;
  waitForIdle(): Promise<void>;
}

class DefaultGenerationWorker implements GenerationWorker {
  readonly #eventBus: GenerationEventBus;
  readonly #telemetry: GenerationTelemetry;
  readonly #store: GenerationStore;
  readonly #processor: GenerationProcessor;
  readonly #pollIntervalMs: number;
  readonly #submittedTimeoutMs: number;
  readonly #logger: FastifyBaseLogger | undefined;
  readonly #now: () => Date;

  #started = false;
  #stopping = false;
  #drainActive = false;
  #scheduled = false;
  #pollTimer: NodeJS.Timeout | undefined;
  #unsubscribe: (() => void) | undefined;
  #activeProcessController: AbortController | undefined;
  #idlePromise = Promise.resolve();
  #resolveIdle: (() => void) | undefined;

  constructor(options: GenerationWorkerOptions) {
    if (options.submittedTimeoutMs === undefined) {
      throw new Error('GenerationWorkerOptions.submittedTimeoutMs is required.');
    }

    if (options.now === undefined) {
      throw new Error('GenerationWorkerOptions.now is required.');
    }

    this.#eventBus = options.eventBus;
    this.#telemetry = options.telemetry;
    this.#store = options.store;
    this.#processor = options.processor;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#submittedTimeoutMs = options.submittedTimeoutMs;
    this.#logger = options.logger;
    this.#now = options.now;
  }

  async start(): Promise<void> {
    if (this.#started) {
      return;
    }

    this.#started = true;
    this.#stopping = false;
    this.#unsubscribe = this.#eventBus.subscribe((event) => {
      if (event.type === 'upsert' && event.generation.status === 'queued') {
        this.wake();
      }
    });

    const recovered = await this.#store.failSubmittedOnStartup(startupRecoveryError);
    for (const generation of recovered) {
      this.#publishUpsert(generation);
      this.#publishTerminalMilestone(generation, startupRecoveryError);
    }

    this.#pollTimer = setInterval(() => {
      this.wake();
    }, this.#pollIntervalMs);
    this.#pollTimer.unref?.();

    this.wake();
  }

  async stop(): Promise<void> {
    if (!this.#started) {
      return;
    }

    this.#stopping = true;
    if (this.#pollTimer !== undefined) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#activeProcessController?.abort();
    await this.waitForIdle();
    this.#started = false;
  }

  wake(): void {
    if (!this.#started || this.#stopping) {
      return;
    }

    this.#scheduled = true;
    if (this.#drainActive) {
      return;
    }

    this.#drainActive = true;
    this.#idlePromise = new Promise<void>((resolve) => {
      this.#resolveIdle = resolve;
    });

    queueMicrotask(() => {
      void this.#drain();
    });
  }

  async waitForIdle(): Promise<void> {
    await this.#idlePromise;
  }

  async #drain(): Promise<void> {
    try {
      while (!this.#stopping) {
        this.#scheduled = false;
        const recovered = await this.#failStaleSubmittedGenerations();
        for (const generation of recovered) {
          this.#publishUpsert(generation);
          this.#publishTerminalMilestone(generation, staleSubmittedRecoveryError);
        }

        while (!this.#stopping) {
          const generation = await this.#store.claimNextQueued();
          if (generation === undefined) {
            break;
          }

          this.#publishUpsert(generation);
          this.#telemetry.publishMilestone({
            generationId: generation.id,
            source: generationTelemetrySources.worker,
            status: 'submitted',
            message: 'Generation execution started.'
          });
          const result = await this.#runProcessor(generation);
          const terminalGeneration = await this.#finalizeGenerationResult(
            generation,
            result
          );

          if (terminalGeneration !== undefined) {
            this.#publishUpsert(terminalGeneration);
            this.#publishTerminalMilestone(terminalGeneration);
          }
        }

        if (!this.#scheduled) {
          break;
        }
      }
    } catch (error) {
      this.#logger?.error(
        {
          err: error
        },
        'generation worker drain failed'
      );
    } finally {
      this.#drainActive = false;
      this.#resolveIfIdle();
    }
  }

  async #failStaleSubmittedGenerations(): Promise<readonly StoredGeneration[]> {
    const staleBefore = new Date(
      this.#now().getTime() - this.#submittedTimeoutMs
    ).toISOString();

    return this.#store.failStaleSubmittedBefore(staleBefore, staleSubmittedRecoveryError);
  }

  async #runProcessor(generation: StoredGeneration): Promise<GenerationProcessResult> {
    const processController = new AbortController();
    this.#activeProcessController = processController;

    try {
      return await this.#processor.process(generation, processController.signal);
    } catch (error) {
      this.#logger?.error(
        {
          err: error,
          generationId: generation.id
        },
        'generation processor failed'
      );
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (this.#activeProcessController === processController) {
        this.#activeProcessController = undefined;
      }
    }
  }

  async #finalizeGenerationResult(
    generation: StoredGeneration,
    result: GenerationProcessResult
  ): Promise<StoredGeneration | undefined> {
    const status = result.status;
    let updated: StoredGeneration | undefined;
    switch (status) {
      case 'completed':
        updated = await this.#store.markCompleted(generation.id);
        break;
      case 'failed':
        updated = await this.#store.markFailed(generation.id, result.error);
        break;
      case 'canceled':
        updated = await this.#store.markCanceled(generation.id);
        break;
      default:
        assertUnsupportedGenerationResultStatus(status);
    }

    if (updated !== undefined) {
      return updated;
    }

    const current = await this.#store.getStoredById(generation.id);
    if (current === undefined || !isTerminalGenerationStatus(current.status)) {
      return undefined;
    }

    return current;
  }

  #publishUpsert(generation: Generation): void {
    this.#eventBus.publish({
      type: 'upsert',
      generationId: generation.id,
      generation
    });
  }

  #publishTerminalMilestone(
    generation: StoredGeneration,
    fallbackMessage?: string
  ): void {
    this.#telemetry.publishMilestone({
      generationId: generation.id,
      source: generationTelemetrySources.worker,
      status: generation.status,
      ...(generation.error !== null
        ? { message: generation.error }
        : fallbackMessage !== undefined
          ? { message: fallbackMessage }
          : {})
    });
    this.#telemetry.clearRun(generation.id);
  }

  #resolveIfIdle(): void {
    const resolveIdle = this.#resolveIdle;
    if (resolveIdle === undefined) {
      return;
    }

    this.#resolveIdle = undefined;
    resolveIdle();
  }
}

function isTerminalGenerationStatus(status: Generation['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

function assertUnsupportedGenerationResultStatus(status: never): never {
  throw new Error(`Unsupported generation result status: ${String(status)}`);
}

export function createGenerationWorker(
  options: GenerationWorkerOptions
): GenerationWorker {
  return new DefaultGenerationWorker(options);
}
