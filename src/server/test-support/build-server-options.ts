import type { FastifyBaseLogger } from 'fastify';

import { appStatusResponseSchema, type AppStatusResponse } from '../../shared/status.js';
import type { AppConfig } from '../config/app-config.js';
import {
  createGenerationEventBus,
  type GenerationEventBus
} from '../generations/events.js';
import { createGenerationStore } from '../generations/default-store.js';
import type { GenerationStore } from '../generations/store.js';
import {
  createGenerationTelemetry,
  type GenerationTelemetry
} from '../generations/telemetry.js';
import type { BuildServerOptions } from '../http/server-app.js';
import type { ServerLoggerOptions } from '../logging/server-logging.js';
import {
  createEmptyPresetCatalog,
  type PresetCatalog
} from '../presets/preset-catalog.js';
import { type AppRuntimeStatusService } from '../status/runtime-status.js';

export interface TestBuildServerOptions {
  config?: AppConfig;
  presetCatalog?: PresetCatalog;
  generationStore?: GenerationStore;
  generationEventBus?: GenerationEventBus;
  generationTelemetry?: GenerationTelemetry;
  runtimeStatus?: Pick<AppRuntimeStatusService, 'getStatus' | 'start' | 'ensureOnline'>;
  logger?: ServerLoggerOptions;
  loggerInstance?: FastifyBaseLogger;
}

export function createBuildServerOptions(
  options: TestBuildServerOptions = {}
): BuildServerOptions {
  const generationEventBus = options.generationEventBus ?? createGenerationEventBus();

  return {
    presetCatalog: options.presetCatalog ?? createEmptyPresetCatalog(),
    generationStore: options.generationStore ?? createGenerationStore(),
    generationEventBus,
    generationTelemetry:
      options.generationTelemetry ??
      createGenerationTelemetry({
        eventBus: generationEventBus,
        now: () => new Date()
      }),
    runtimeStatus:
      options.runtimeStatus ??
      createStaticAppRuntimeStatusService({
        state: 'Offline',
        since: new Date().toISOString()
      }),
    ...(options.config !== undefined ? { config: options.config } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.loggerInstance !== undefined
      ? { loggerInstance: options.loggerInstance }
      : {})
  };
}

function createStaticAppRuntimeStatusService(
  initialStatus?: AppStatusResponse
): AppRuntimeStatusService {
  const status =
    initialStatus ??
    appStatusResponseSchema.parse({
      state: 'Offline',
      since: new Date().toISOString()
    });

  return {
    getStatus() {
      return status;
    },
    async start() {
      return status;
    },
    async ensureOnline() {
      if (status.state === 'Online') {
        return;
      }

      throw new Error(buildEnsureOnlineMessage(status));
    },
    async stop() {
      return;
    }
  };
}

function buildEnsureOnlineMessage(status: AppStatusResponse): string {
  if (status.state === 'StartupFailed') {
    return (
      status.lastError ??
      'ComfyUI startup failed. Start ComfyUI again before running generations.'
    );
  }

  return 'ComfyUI startup has not been initiated. Start ComfyUI before running generations.';
}
