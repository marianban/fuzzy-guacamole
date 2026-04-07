import type { FastifyBaseLogger } from 'fastify';

import type { Generation } from '../../shared/generations.js';
import type { GenerationEventBus } from './events.js';
import type { GenerationProcessor, GenerationProcessResult } from './processor.js';
import type { GenerationStore } from './store.js';

const startupRecoveryError =
  'Generation processing was interrupted during server shutdown.';

export interface GenerationWorkerOptions {
  eventBus: GenerationEventBus;
  store: GenerationStore;
  processor: GenerationProcessor;
  pollIntervalMs: number;
  logger?: FastifyBaseLogger;
}

export interface GenerationWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  wake(): void;
  waitForIdle(): Promise<void>;
}

class DefaultGenerationWorker implements GenerationWorker {
  readonly #eventBus: GenerationEventBus;
  readonly #store: GenerationStore;
  readonly #processor: GenerationProcessor;
  readonly #pollIntervalMs: number;
  readonly #logger: FastifyBaseLogger | undefined;

  #started = false;
  #stopping = false;
  #running = false;
  #scheduled = false;
  #queuedTask = false;
  #pollTimer: NodeJS.Timeout | undefined;
  #unsubscribe: (() => void) | undefined;
  #idlePromise = Promise.resolve();
  #resolveIdle: (() => void) | undefined;

  constructor(options: GenerationWorkerOptions) {
    this.#eventBus = options.eventBus;
    this.#store = options.store;
    this.#processor = options.processor;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#logger = options.logger;
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
    await this.waitForIdle();
    this.#started = false;
  }

  wake(): void {
    if (!this.#started || this.#stopping) {
      return;
    }

    this.#scheduled = true;
    if (this.#running || this.#queuedTask) {
      return;
    }

    this.#queuedTask = true;
    this.#idlePromise = new Promise<void>((resolve) => {
      this.#resolveIdle = resolve;
    });

    queueMicrotask(() => {
      this.#queuedTask = false;
      void this.#drain();
    });
  }

  async waitForIdle(): Promise<void> {
    await this.#idlePromise;
  }

  async #drain(): Promise<void> {
    if (this.#running || this.#stopping) {
      this.#resolveIfIdle();
      return;
    }

    this.#running = true;
    let shouldReschedule = false;
    try {
      while (!this.#stopping) {
        this.#scheduled = false;
        const generation = await this.#store.claimNextQueued();
        if (generation === undefined) {
          break;
        }

        this.#publishUpsert(generation);
        const result = await this.#runProcessor(generation);
        const terminalGeneration =
          result.status === 'completed'
            ? await this.#store.markCompleted(generation.id)
            : await this.#store.markFailed(generation.id, result.error);

        if (terminalGeneration !== undefined) {
          this.#publishUpsert(terminalGeneration);
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
      this.#running = false;
      shouldReschedule = this.#scheduled && !this.#stopping;
      if (!shouldReschedule) {
        this.#resolveIfIdle();
      }
    }

    if (shouldReschedule) {
      this.wake();
    }
  }

  async #runProcessor(generation: Generation): Promise<GenerationProcessResult> {
    try {
      return await this.#processor.process(generation);
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
    }
  }

  #publishUpsert(generation: Generation): void {
    this.#eventBus.publish({
      type: 'upsert',
      generationId: generation.id,
      generation
    });
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

export function createGenerationWorker(
  options: GenerationWorkerOptions
): GenerationWorker {
  return new DefaultGenerationWorker(options);
}
