import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { appStatusResponseSchema } from '../../shared/status.js';

export function registerStatusRoutes(app: FastifyInstance, stateSince: string): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/status',
    {
      schema: {
        tags: ['status'],
        summary: 'Current app status',
        response: {
          200: appStatusResponseSchema
        }
      }
    },
    async () => {
      return appStatusResponseSchema.parse({
        state: 'Starting',
        since: stateSince
      });
    }
  );
}
