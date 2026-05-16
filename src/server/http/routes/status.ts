import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { appStatusResponseSchema } from '../../../shared/status.js';
import type { AppRuntimeStatusService } from '../../status/runtime-status.js';

export function registerStatusRoutes(
  app: FastifyInstance,
  statusService: AppRuntimeStatusService
): void {
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
      return appStatusResponseSchema.parse(statusService.getStatus());
    }
  );
}
