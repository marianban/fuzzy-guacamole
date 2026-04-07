import type { FastifyInstance } from 'fastify';

import { buildServer } from './http/server-app.js';
import { loadAppConfig } from './config/app-config.js';
import { createDatabase } from './db/client.js';
import { createPostgresGenerationStore } from './generations/store.js';
import { createServerLogger } from './logging/server-logging.js';
import { loadPresetCatalog } from './presets/preset-catalog.js';

try {
  process.loadEnvFile?.();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const logger = createServerLogger();
let app: FastifyInstance | undefined;
let fatalShutdownInProgress = false;

process.on('uncaughtException', (error) => {
  void logFatalAndExit('uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  void logFatalAndExit('unhandled rejection', reason);
});

try {
  const config = await loadAppConfig();
  const presetCatalog = await loadPresetCatalog({
    presetsDir: config.paths.presets
  });
  const database = createDatabase();
  app = buildServer({
    config,
    presetCatalog,
    generationStore: createPostgresGenerationStore(database),
    loggerInstance: logger
  });
  app.addHook('onClose', async () => {
    await database.close();
  });

  const stopSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of stopSignals) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutdown signal received');
      if (app !== undefined) {
        void app.close();
      }
    });
  }

  await app.listen({ host, port });
  logger.info({ host, port }, 'API listening');
} catch (error) {
  logger.fatal({ err: error }, 'API startup failed');
  process.exit(1);
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
