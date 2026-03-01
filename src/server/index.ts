import { buildServer } from './app.js';
import { loadAppConfig } from './config.js';
import { loadPresetCatalog } from './presets.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  const config = await loadAppConfig();
  const presetCatalog = await loadPresetCatalog({
    presetsDir: config.paths.presets
  });
  const app = buildServer({ config, presetCatalog });

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
