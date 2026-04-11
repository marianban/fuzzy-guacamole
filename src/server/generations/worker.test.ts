// @vitest-environment node

import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import type { Generation } from '../../shared/generations.js';
import type { GenerationProcessResult } from './processor.js';
import type { StoredGeneration } from './stored-generation.js';
import { createGenerationEventBus } from './events.js';
import { createGenerationStore } from './store.js';
import { createGenerationWorker } from './worker.js';

describe('createGenerationWorker', () => {
  test('given_required_runtime_options_missing_when_creating_worker_then_it_throws', () => {
    expect(() =>
      createGenerationWorker({
        eventBus: createGenerationEventBus(),
        store: createGenerationStore(),
        pollIntervalMs: 60_000,
        processor: {
          async process() {
            return { status: 'completed' };
          }
        }
      } as unknown as Parameters<typeof createGenerationWorker>[0])
    ).toThrow(/submittedTimeoutMs/i);

    expect(() =>
      createGenerationWorker({
        eventBus: createGenerationEventBus(),
        store: createGenerationStore(),
        pollIntervalMs: 60_000,
        submittedTimeoutMs: 30_000,
        processor: {
          async process() {
            return { status: 'completed' };
          }
        }
      } as unknown as Parameters<typeof createGenerationWorker>[0])
    ).toThrow(/now/i);
  });

  test('given_multiple_queued_generations_when_worker_drains_then_oldest_generation_finishes_first', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const processedGenerationIds: string[] = [];

    const oldest = await createQueuedGeneration(store, {
      prompt: 'oldest',
      queuedAt: '2026-04-07T10:00:00.000Z',
      createdAt: '2026-04-07T09:59:00.000Z'
    });
    const newest = await createQueuedGeneration(store, {
      prompt: 'newest',
      queuedAt: '2026-04-07T10:05:00.000Z',
      createdAt: '2026-04-07T10:04:00.000Z'
    });

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        async process(generation) {
          processedGenerationIds.push(generation.id);
          return { status: 'completed' };
        }
      }
    });

    await worker.start();
    await worker.waitForIdle();

    expect(processedGenerationIds).toEqual([oldest.id, newest.id]);
    await expect(store.getById(oldest.id)).resolves.toMatchObject({
      id: oldest.id,
      status: 'completed'
    });
    await expect(store.getById(newest.id)).resolves.toMatchObject({
      id: newest.id,
      status: 'completed'
    });

    await worker.stop();
  });

  test('given_processor_failure_when_worker_processes_generation_then_generation_is_failed_without_retry', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const generation = await createQueuedGeneration(store, {
      prompt: 'fail once',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    const process = vi.fn(async () => {
      throw new Error('processor exploded');
    });

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        process
      }
    });

    await worker.start();
    await worker.waitForIdle();
    worker.wake();
    await worker.waitForIdle();

    expect(process).toHaveBeenCalledTimes(1);
    await expect(store.getById(generation.id)).resolves.toMatchObject({
      id: generation.id,
      status: 'failed',
      error: 'processor exploded'
    });

    await worker.stop();
  });

  test('given_submitted_generation_when_worker_starts_then_startup_recovery_marks_it_failed', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const submitted = await createQueuedGeneration(store, {
      prompt: 'stale submitted',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    await store.save({
      ...submitted,
      status: 'submitted',
      updatedAt: '2026-04-07T10:01:00.000Z'
    });

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        async process() {
          return { status: 'completed' };
        }
      }
    });

    await worker.start();
    await worker.waitForIdle();

    await expect(store.getById(submitted.id)).resolves.toMatchObject({
      id: submitted.id,
      status: 'failed',
      error: expect.stringMatching(/interrupted/i)
    });

    await worker.stop();
  });

  test('given_processor_cancels_generation_when_worker_drains_then_generation_is_marked_canceled_and_event_is_published', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const generation = await createQueuedGeneration(store, {
      prompt: 'cancel me',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    const publishedStatuses: string[] = [];
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'upsert' && event.generation.id === generation.id) {
        publishedStatuses.push(event.generation.status);
      }
    });

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        async process() {
          return { status: 'canceled' };
        }
      }
    });

    try {
      await worker.start();
      await worker.waitForIdle();

      await expect(store.getById(generation.id)).resolves.toMatchObject({
        id: generation.id,
        status: 'canceled'
      });
      expect(publishedStatuses).toContain('submitted');
      expect(publishedStatuses).toContain('canceled');
    } finally {
      unsubscribe();
      await worker.stop();
    }
  });

  test('given_processor_returns_unknown_status_when_worker_drains_then_worker_logs_error_and_generation_remains_submitted', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const generation = await createQueuedGeneration(store, {
      prompt: 'unknown status',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    const loggerError = vi.fn();
    const logger = {
      error: loggerError
    } as unknown as FastifyBaseLogger;

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      logger,
      processor: {
        async process() {
          return {
            status: 'unknown'
          } as unknown as GenerationProcessResult;
        }
      }
    });

    await worker.start();
    await worker.waitForIdle();

    await expect(store.getById(generation.id)).resolves.toMatchObject({
      id: generation.id,
      status: 'submitted'
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error)
      }),
      'generation worker drain failed'
    );

    await worker.stop();
  });

  test('given_stale_submitted_generation_when_worker_wakes_then_worker_marks_it_failed', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const generation = await createQueuedGeneration(store, {
      prompt: 'stale runtime submitted',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date('2026-04-07T10:01:00.000Z'),
      processor: {
        async process() {
          return { status: 'completed' };
        }
      }
    });

    await worker.start();
    await worker.waitForIdle();

    const current = await store.getById(generation.id);
    expect(current).toBeDefined();

    await store.save({
      ...(current as Generation),
      status: 'submitted',
      updatedAt: '2026-04-07T10:00:20.000Z'
    });

    worker.wake();
    await worker.waitForIdle();

    await expect(store.getById(generation.id)).resolves.toMatchObject({
      id: generation.id,
      status: 'failed',
      error: expect.stringMatching(/timed out/i)
    });

    await worker.stop();
  });

  test('given_stale_recovery_when_worker_drains_then_worker_uses_store_level_recovery_instead_of_listing_all_generations', async () => {
    const eventBus = createGenerationEventBus();
    const failStaleSubmittedBefore = vi.fn(async () => [] as readonly StoredGeneration[]);
    const list = vi.fn(async () => {
      throw new Error('list should not be called for stale recovery');
    });
    const store = {
      create: vi.fn(),
      list,
      getById: vi.fn(),
      getStoredById: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      deleteDeletable: vi.fn(),
      setInputImagePath: vi.fn(),
      markQueued: vi.fn(),
      claimNextQueued: vi.fn(async () => undefined),
      recordPromptRequest: vi.fn(),
      recordPromptResponse: vi.fn(),
      markCanceled: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      failSubmittedOnStartup: vi.fn(async () => []),
      failStaleSubmittedBefore
    };

    const worker = createGenerationWorker({
      eventBus,
      store: store as unknown as Parameters<typeof createGenerationWorker>[0]['store'],
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date('2026-04-07T10:01:00.000Z'),
      processor: {
        async process() {
          return { status: 'completed' };
        }
      }
    });

    await worker.start();
    await worker.waitForIdle();

    expect(failStaleSubmittedBefore).toHaveBeenCalledWith(
      '2026-04-07T10:00:30.000Z',
      expect.stringMatching(/timed out/i)
    );
    expect(list).not.toHaveBeenCalled();

    await worker.stop();
  });

  test('given_wake_called_while_drain_is_active_when_processing_finishes_then_worker_runs_a_followup_pass', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const first = await createQueuedGeneration(store, {
      prompt: 'first',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const processedGenerationIds: string[] = [];

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        async process(generation) {
          processedGenerationIds.push(generation.id);
          if (generation.id === first.id) {
            firstStarted.resolve();
            await releaseFirst.promise;
          }

          return { status: 'completed' };
        }
      }
    });

    await worker.start();
    await firstStarted.promise;

    const second = await createQueuedGeneration(store, {
      prompt: 'second',
      queuedAt: '2026-04-07T10:01:00.000Z'
    });
    worker.wake();
    releaseFirst.resolve();
    await worker.waitForIdle();

    expect(processedGenerationIds).toEqual([first.id, second.id]);
    await expect(store.getById(first.id)).resolves.toMatchObject({
      id: first.id,
      status: 'completed'
    });
    await expect(store.getById(second.id)).resolves.toMatchObject({
      id: second.id,
      status: 'completed'
    });

    await worker.stop();
  });

  test('given_worker_stop_while_processor_is_running_when_stopping_then_active_processor_signal_is_aborted', async () => {
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const generation = await createQueuedGeneration(store, {
      prompt: 'abort on stop',
      queuedAt: '2026-04-07T10:00:00.000Z'
    });
    const processingStarted = createDeferred<void>();
    const observedAbort = createDeferred<void>();

    const worker = createGenerationWorker({
      eventBus,
      store,
      pollIntervalMs: 60_000,
      submittedTimeoutMs: 30_000,
      now: () => new Date(),
      processor: {
        async process(currentGeneration, signal) {
          expect(currentGeneration.id).toBe(generation.id);
          expect(signal).toBeDefined();
          const activeSignal = signal as AbortSignal;
          processingStarted.resolve();

          if (activeSignal.aborted) {
            observedAbort.resolve();
          } else {
            activeSignal.addEventListener(
              'abort',
              () => {
                observedAbort.resolve();
              },
              { once: true }
            );
          }

          await observedAbort.promise;
          return { status: 'canceled' };
        }
      }
    });

    await worker.start();
    await processingStarted.promise;
    await worker.stop();

    await expect(store.getById(generation.id)).resolves.toMatchObject({
      id: generation.id,
      status: 'canceled'
    });
  });
});

async function createQueuedGeneration(
  store: ReturnType<typeof createGenerationStore>,
  options: {
    prompt: string;
    queuedAt: string;
    createdAt?: string;
  }
): Promise<Generation> {
  const draft = await store.create({
    presetId: 'img2img-basic/basic',
    templateId: 'img2img-basic',
    presetParams: {
      prompt: options.prompt
    }
  });

  return store.save({
    ...draft,
    status: 'queued',
    queuedAt: options.queuedAt,
    createdAt: options.createdAt ?? options.queuedAt,
    updatedAt: options.queuedAt,
    error: null
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {
    promise,
    resolve
  };
}
