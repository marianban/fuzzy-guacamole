import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from './config.js';
import {
  type PresetCatalog,
  createEmptyPresetCatalog
} from './presets.js';
import { registerPresetRoutes } from './routes/presets.js';
import { registerStatusRoutes } from './routes/status.js';

export interface BuildServerOptions {
  stateSince?: string;
  config?: AppConfig;
  presetCatalog?: PresetCatalog;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true
  });
  const stateSince = options.stateSince ?? new Date().toISOString();
  const presetCatalog = options.presetCatalog ?? createEmptyPresetCatalog();

  app.get('/healthz', async () => ({ ok: true }));
  registerStatusRoutes(app, stateSince);
  registerPresetRoutes(app, presetCatalog);

  return app;
}
