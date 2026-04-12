// @vitest-environment node

import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { ComfyHealthCheckResult } from '../comfy/client.js';
import {
  createAppRuntimeStatusService,
  type AppRuntimeStatusServiceOptions
} from './runtime-status.js';

describe('createAppRuntimeStatusService', () => {
  it('given_service_created_when_no_startup_has_been_requested_then_state_is_offline', () => {
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(vi.fn(async () => ({ ok: true }))),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow(['2026-04-11T10:00:00.000Z']),
      sleep: vi.fn(async () => undefined)
    });

    expect(service.getStatus()).toEqual({
      state: 'Offline',
      since: '2026-04-11T10:00:00.000Z'
    });
  });

  it('given_start_requested_when_comfy_becomes_ready_then_state_transitions_to_online', async () => {
    const healthCheck = vi
      .fn<() => Promise<ComfyHealthCheckResult>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        systemStats: {
          system: {
            comfyui_version: '0.8.2',
            pytorch_version: '2.8.0'
          },
          devices: [{ name: 'RTX 4090', type: 'cuda', vram_free: 20, vram_total: 24 }]
        }
      });
    const sleep = vi.fn(async () => undefined);
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.050Z',
        '2026-04-11T10:00:00.100Z'
      ]),
      sleep
    });

    await expect(service.start()).resolves.toEqual({
      state: 'Starting',
      since: '2026-04-11T10:00:00.000Z'
    });

    await expect(service.ensureOnline()).resolves.toBeUndefined();
    expect(service.getStatus()).toEqual({
      state: 'Online',
      since: '2026-04-11T10:00:00.000Z',
      comfy: {
        comfyuiVersion: '0.8.2',
        pytorchVersion: '2.8.0',
        devices: [{ name: 'RTX 4090', type: 'cuda', vram_free: 20, vram_total: 24 }]
      }
    });
    expect(healthCheck).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('given_start_requested_when_comfy_never_becomes_ready_then_state_transitions_to_startup_failed', async () => {
    const logger = createLoggerStub();
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(vi.fn(async () => ({ ok: false }))),
      healthPollMs: 50,
      startupTimeoutMs: 100,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.050Z',
        '2026-04-11T10:00:00.125Z'
      ]),
      sleep: (_delayMs, signal) => {
        if (signal.aborted) {
          return Promise.reject(createAbortError());
        }

        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(createAbortError());
            },
            { once: true }
          );
        });
      },
      logger
    });

    await service.start();

    await expect(service.ensureOnline()).rejects.toThrow(/timed out/i);
    expect(service.getStatus()).toEqual({
      state: 'StartupFailed',
      since: '2026-04-11T10:00:00.000Z',
      lastError: 'ComfyUI startup timed out before readiness was confirmed.'
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        status: expect.objectContaining({
          state: 'StartupFailed',
          lastError: 'ComfyUI startup timed out before readiness was confirmed.'
        })
      },
      'ComfyUI startup failed'
    );
  });

  it('given_start_requested_when_healthcheck_throws_then_state_transitions_to_startup_failed', async () => {
    const healthCheck = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const logger = createLoggerStub();
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.025Z'
      ]),
      sleep: vi.fn(async () => undefined),
      logger
    });

    await service.start();

    await expect(service.ensureOnline()).rejects.toThrow('connection refused');
    expect(service.getStatus()).toEqual({
      state: 'StartupFailed',
      since: '2026-04-11T10:00:00.025Z',
      lastError: 'connection refused'
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        status: expect.objectContaining({
          state: 'StartupFailed',
          lastError: 'connection refused'
        })
      },
      'ComfyUI startup failed'
    );
  });

  it('given_health_check_respects_abort_when_ensure_online_waits_then_startup_times_out', async () => {
    const healthCheck = vi.fn(
      async ({ signal }: { signal?: AbortSignal } = {}) =>
        new Promise<ComfyHealthCheckResult>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              reject(createAbortError());
            },
            { once: true }
          );
        })
    );
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 20,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.020Z'
      ]),
      sleep: vi.fn(async () => undefined)
    });

    await service.start();

    const outcome = await Promise.race([
      service.ensureOnline().then(
        () => 'resolved',
        (error) => normalizeSettledError(error)
      ),
      waitFor(60).then(() => 'timed out waiting for ensureOnline')
    ]);

    expect(outcome).toBe('ComfyUI startup timed out before readiness was confirmed.');
    expect(service.getStatus()).toEqual({
      state: 'StartupFailed',
      since: '2026-04-11T10:00:00.020Z',
      lastError: 'ComfyUI startup timed out before readiness was confirmed.'
    });
  });

  it('given_start_requested_twice_while_starting_then_callers_share_one_startup_attempt', async () => {
    const healthCheck = vi.fn(async () => ({
      ok: true,
      systemStats: {
        system: {
          comfyui_version: '0.8.2'
        },
        devices: []
      }
    }));
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.010Z'
      ]),
      sleep: vi.fn(async () => undefined)
    });

    await Promise.all([service.start(), service.start(), service.ensureOnline()]);

    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({
      state: 'Online'
    });
  });

  it('given_service_offline_when_ensure_online_is_called_then_it_rejects_without_starting', async () => {
    const healthCheck = vi.fn(async () => ({ ok: true }));
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow(['2026-04-11T10:00:00.000Z']),
      sleep: vi.fn(async () => undefined)
    });

    await expect(service.ensureOnline()).rejects.toThrow(
      /startup has not been initiated/i
    );
    expect(healthCheck).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({
      state: 'Offline',
      since: '2026-04-11T10:00:00.000Z'
    });
  });

  it('given_startup_is_aborted_by_stop_when_stop_completes_then_state_returns_to_offline', async () => {
    const healthCheck = vi.fn(async () => ({ ok: false }));
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow([
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.000Z',
        '2026-04-11T10:00:00.010Z'
      ]),
      sleep: (_delayMs, signal) => {
        if (signal.aborted) {
          return Promise.reject(createAbortError());
        }

        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(createAbortError());
            },
            { once: true }
          );
        });
      }
    });

    await service.start();
    await service.stop();

    expect(service.getStatus()).toEqual({
      state: 'Offline',
      since: '2026-04-11T10:00:00.010Z'
    });
  });

  it('given_service_has_stopped_when_start_is_called_then_start_is_rejected', async () => {
    const healthCheck = vi.fn(async () => ({ ok: true }));
    const service = createAppRuntimeStatusService({
      comfyClient: createComfyClientStub(healthCheck),
      healthPollMs: 50,
      startupTimeoutMs: 500,
      now: createNow(['2026-04-11T10:00:00.000Z']),
      sleep: vi.fn(async () => undefined)
    });

    await service.stop();

    await expect(service.start()).rejects.toThrow(
      /startup service is stopping and cannot accept a new startup request/i
    );
    expect(healthCheck).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({
      state: 'Offline',
      since: '2026-04-11T10:00:00.000Z'
    });
  });
});

function createNow(values: readonly string[]): () => Date {
  let index = 0;
  const fallbackValue = values[values.length - 1] ?? '1970-01-01T00:00:00.000Z';

  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? fallbackValue;
    index += 1;
    return new Date(value);
  };
}

function createComfyClientStub(
  healthCheck: AppRuntimeStatusServiceOptions['comfyClient']['healthCheck']
): AppRuntimeStatusServiceOptions['comfyClient'] {
  return {
    healthCheck
  };
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function createLoggerStub(): Pick<FastifyBaseLogger, 'error'> {
  return {
    error: vi.fn()
  } as Pick<FastifyBaseLogger, 'error'>;
}

function normalizeSettledError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
