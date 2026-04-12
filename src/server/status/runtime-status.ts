import { setTimeout as sleepWithSignal } from 'node:timers/promises';
import type { FastifyBaseLogger } from 'fastify';

import {
  appStatusResponseSchema,
  type AppStatusResponse,
  type AppStatusState
} from '../../shared/status.js';
import type { ComfyClient, ComfyHealthCheckResult } from '../comfy/client.js';

const STARTUP_NOT_INITIATED_ERROR =
  'ComfyUI startup has not been initiated. Start ComfyUI before running generations.';
const STARTUP_TIMEOUT_ERROR = 'ComfyUI startup timed out before readiness was confirmed.';
const STARTUP_STOPPING_ERROR =
  'ComfyUI startup service is stopping and cannot accept a new startup request.';

export interface AppRuntimeStatusService {
  getStatus(): AppStatusResponse;
  start(): Promise<AppStatusResponse>;
  ensureOnline(): Promise<void>;
  stop(): Promise<void>;
}

export interface AppRuntimeStatusServiceOptions {
  comfyClient: Pick<ComfyClient, 'healthCheck'>;
  healthPollMs: number;
  startupTimeoutMs: number;
  logger?: Pick<FastifyBaseLogger, 'error'>;
  now?: () => Date;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export function createAppRuntimeStatusService(
  options: AppRuntimeStatusServiceOptions
): AppRuntimeStatusService {
  return new DefaultAppRuntimeStatusService(options);
}

class DefaultAppRuntimeStatusService implements AppRuntimeStatusService {
  readonly #comfyClient: AppRuntimeStatusServiceOptions['comfyClient'];
  readonly #healthPollMs: number;
  readonly #startupTimeoutMs: number;
  readonly #logger: AppRuntimeStatusServiceOptions['logger'];
  readonly #now: () => Date;
  readonly #sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;

  #status: AppStatusResponse;
  #activeStartup: Promise<void> | undefined;
  #startupAbortController: AbortController | undefined;
  #stopping = false;

  constructor(options: AppRuntimeStatusServiceOptions) {
    this.#comfyClient = options.comfyClient;
    this.#healthPollMs = options.healthPollMs;
    this.#startupTimeoutMs = options.startupTimeoutMs;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? defaultSleep;
    this.#status = this.#buildStatus('Offline');
  }

  getStatus(): AppStatusResponse {
    return this.#status;
  }

  async start(): Promise<AppStatusResponse> {
    if (this.#stopping) {
      throw new Error(STARTUP_STOPPING_ERROR);
    }

    if (this.#status.state === 'Online') {
      return this.#status;
    }

    if (this.#activeStartup !== undefined) {
      return this.#status;
    }

    this.#status = this.#buildStatus('Starting');
    const startupAbortController = new AbortController();
    this.#startupAbortController = startupAbortController;

    const startup = this.#runStartup(startupAbortController);
    this.#activeStartup = startup;
    const trackedStartup = startup.finally(() => {
      if (this.#activeStartup === startup) {
        this.#activeStartup = undefined;
      }

      if (this.#startupAbortController === startupAbortController) {
        this.#startupAbortController = undefined;
      }
    });
    // This startup task is intentionally fire-and-forget; attach a terminal rejection
    // handler so cleanup cannot trigger an unhandled rejection when callers do not await it.
    void trackedStartup.catch(() => undefined);

    return this.#status;
  }

  async ensureOnline(): Promise<void> {
    if (this.#status.state === 'Online') {
      return;
    }

    if (this.#activeStartup !== undefined) {
      await this.#activeStartup;
      return;
    }

    throw new Error(buildEnsureOnlineMessage(this.#status));
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#startupAbortController?.abort();
    try {
      await this.#activeStartup;
    } catch {
      return;
    }
  }

  async #runStartup(startupAbortController: AbortController): Promise<void> {
    const startupSignal = startupAbortController.signal;
    const startupTimeoutSignal = AbortSignal.timeout(this.#startupTimeoutMs);
    const runSignal = AbortSignal.any([startupSignal, startupTimeoutSignal]);

    try {
      while (!this.#stopping) {
        const health = await this.#comfyClient.healthCheck({ signal: runSignal });
        if (health.ok) {
          this.#status = this.#buildOnlineStatus(health);
          return;
        }

        await this.#sleep(this.#healthPollMs, runSignal);
      }

      this.#status = this.#buildStatus('Offline');
    } catch (error) {
      if (isAbortError(error) && this.#stopping) {
        this.#status = this.#buildStatus('Offline');
        return;
      }

      if (startupTimeoutSignal.aborted && !startupSignal.aborted) {
        const since = this.#now().toISOString();
        this.#status = this.#buildStatus('StartupFailed', {
          since,
          lastError: STARTUP_TIMEOUT_ERROR
        });
        const timeoutError = new Error(STARTUP_TIMEOUT_ERROR);
        this.#logStartupFailure(timeoutError);
        throw timeoutError;
      }

      const message = normalizeErrorMessage(error);
      const since = this.#now().toISOString();
      this.#status = this.#buildStatus('StartupFailed', {
        since,
        lastError: message
      });
      const startupError = error instanceof Error ? error : new Error(message);
      this.#logStartupFailure(startupError);
      throw startupError;
    }
  }

  #buildStatus(
    state: AppStatusState,
    overrides: Partial<AppStatusResponse> = {}
  ): AppStatusResponse {
    return appStatusResponseSchema.parse({
      state,
      since: overrides.since ?? this.#now().toISOString(),
      ...(overrides.lastError !== undefined ? { lastError: overrides.lastError } : {}),
      ...(overrides.comfy !== undefined ? { comfy: overrides.comfy } : {})
    });
  }

  #buildOnlineStatus(health: ComfyHealthCheckResult): AppStatusResponse {
    return this.#buildStatus('Online', {
      comfy: buildComfyStatus(health)
    });
  }

  #logStartupFailure(error: Error): void {
    this.#logger?.error(
      {
        err: error,
        status: this.#status
      },
      'ComfyUI startup failed'
    );
  }
}

function defaultSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return sleepWithSignal(delayMs, undefined, { signal }).then(() => undefined);
}

function buildComfyStatus(
  health: ComfyHealthCheckResult
): AppStatusResponse['comfy'] | undefined {
  if (!health.ok || health.systemStats === undefined) {
    return undefined;
  }

  return {
    ...(health.systemStats.system.comfyui_version !== undefined
      ? { comfyuiVersion: health.systemStats.system.comfyui_version }
      : {}),
    ...(health.systemStats.system.pytorch_version !== undefined
      ? { pytorchVersion: health.systemStats.system.pytorch_version }
      : {}),
    devices: health.systemStats.devices
  };
}

function buildEnsureOnlineMessage(status: AppStatusResponse): string {
  if (status.state === 'StartupFailed') {
    return (
      status.lastError ??
      'ComfyUI startup failed. Start ComfyUI again before running generations.'
    );
  }

  return STARTUP_NOT_INITIATED_ERROR;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
