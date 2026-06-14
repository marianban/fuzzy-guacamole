import type { FastifyInstance } from 'fastify';

import { buildServer } from './http/server-app.js';
import { ComfyClient } from './comfy/client.js';
import { loadAppConfig } from './config/app-config.js';
import { loadServerEnv } from './config/server-env.js';
import { createDatabase } from './db/client.js';
import { createGenerationEventBus } from './generations/events.js';
import { createPostgresGenerationStore } from './generations/postgres-store.js';
import { createGenerationProcessor } from './generations/processor.js';
import { createGenerationTelemetry } from './generations/telemetry.js';
import { createGenerationWorker } from './generations/worker.js';
import { createServerLogger } from './logging/server-logging.js';
import { loadPresetCatalog } from './presets/preset-catalog.js';
import { createAppRuntimeStatusService } from './status/runtime-status.js';

const env = loadServerEnv();
const logger = createServerLogger({
  level: env.LOG_LEVEL,
  filePath: env.LOG_FILE_PATH
});
let app: FastifyInstance | undefined;
let fatalShutdownInProgress = false;

process.on('uncaughtException', (error) => {
  void logFatalAndExit('uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  void logFatalAndExit('unhandled rejection', reason);
});

try {
  const config = await loadAppConfig({ configPath: env.CONFIG_PATH });
  const presetCatalog = await loadPresetCatalog({
    presetsDir: config.paths.presets
  });
  const database = createDatabase({ connectionString: env.DATABASE_URL });
  const generationStore = createPostgresGenerationStore(database);
  const generationEventBus = createGenerationEventBus();
  const generationTelemetry = createGenerationTelemetry({
    eventBus: generationEventBus,
    now: () => new Date()
  });
  const comfyClient = new ComfyClient({
    baseUrl: config.comfyBaseUrl,
    requestTimeoutMs: config.timeouts.requestTimeoutMs,
    historyPollMs: config.timeouts.historyPollMs,
    historyTimeoutMs: config.timeouts.historyTimeoutMs
  });
  const runtimeStatus = createAppRuntimeStatusService({
    comfyClient,
    healthPollMs: config.timeouts.healthPollMs,
    startupTimeoutMs: config.timeouts.comfyBootMs,
    logger,
    now: () => new Date()
  });
  const generationWorker = createGenerationWorker({
    eventBus: generationEventBus,
    telemetry: generationTelemetry,
    store: generationStore,
    processor: createGenerationProcessor({
      store: generationStore,
      telemetry: generationTelemetry,
      comfyClient,
      config,
      runtimeStatus,
      logger
    }),
    pollIntervalMs: config.timeouts.historyPollMs,
    submittedTimeoutMs: config.timeouts.submittedTimeoutMs,
    now: () => new Date(),
    logger
  });
  app = buildServer({
    config,
    presetCatalog,
    generationStore,
    generationEventBus,
    generationTelemetry,
    runtimeStatus,
    loggerInstance: logger
  });
  app.addHook('onClose', async () => {
    await generationWorker.stop();
    await runtimeStatus.stop();
    await database.close();
  });

  registerStopSignalHandlers(app);

  await generationWorker.start();
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ host: env.HOST, port: env.PORT }, 'API listening');
} catch (error) {
  logger.fatal({ err: error }, 'API startup failed');
  process.exit(1);
}

function registerStopSignalHandlers(server: FastifyInstance): void {
  const stopSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of stopSignals) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutdown signal received');
      void server.close();
    });
  }
}

async function logFatalAndExit(message: string, reason: unknown): Promise<never | void> {
  if (fatalShutdownInProgress) {
    return;
  }

  fatalShutdownInProgress = true;
  logger.fatal(
    {
      err: reason instanceof Error ? reason : new Error(String(reason))
    },
    message
  );

  try {
    await app?.close();
  } catch (error) {
    logger.error({ err: error }, 'failed to close app during fatal shutdown');
  } finally {
    process.exit(1);
  }
}
