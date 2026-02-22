import Fastify, { type FastifyInstance } from 'fastify';

import { registerStatusRoutes } from './routes/status.js';

export interface BuildServerOptions {
  stateSince?: string;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true
  });
  const stateSince = options.stateSince ?? new Date().toISOString();

  app.get('/healthz', async () => ({ ok: true }));
  registerStatusRoutes(app, stateSince);

  return app;
}
