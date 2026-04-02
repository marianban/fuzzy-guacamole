import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createPostgresGenerationStore } from './generations/store.js';
import { loadPresetCatalog } from './presets.js';

try {
  process.loadEnvFile?.();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  const config = await loadAppConfig();
  const presetCatalog = await loadPresetCatalog({
    presetsDir: config.paths.presets
  });
  const database = createDatabase();
  const app = buildServer({
    config,
    presetCatalog,
    generationStore: createPostgresGenerationStore(database)
  });
  app.addHook('onClose', async () => {
    await database.close();
  });

  const stopSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of stopSignals) {
    process.on(signal, () => {
      void app.close();
    });
  }

  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
