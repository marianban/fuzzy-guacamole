import type { FastifyInstance } from 'fastify';

import { appStatusResponseSchema } from '../../shared/status.js';

export function registerStatusRoutes(app: FastifyInstance, stateSince: string): void {
  app.get('/api/status', async () => {
    return appStatusResponseSchema.parse({
      state: 'Starting',
      since: stateSince
    });
  });
}
