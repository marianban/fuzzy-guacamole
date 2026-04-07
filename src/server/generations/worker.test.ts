// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';

import type { Generation } from '../../shared/generations.js';
import { createGenerationEventBus } from './events.js';
import { createGenerationStore } from './store.js';
import { createGenerationWorker } from './worker.js';

describe('createGenerationWorker', () => {
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
