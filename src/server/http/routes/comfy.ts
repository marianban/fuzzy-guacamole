import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { appStatusResponseSchema } from '../../../shared/status.js';
import type { AppRuntimeStatusService } from '../../status/runtime-status.js';

export function registerComfyRoutes(
  app: FastifyInstance,
  statusService: AppRuntimeStatusService
): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/comfy/start',
    {
      schema: {
        tags: ['status'],
        summary: 'Start ComfyUI availability startup sequence',
        response: {
          200: appStatusResponseSchema,
          202: appStatusResponseSchema
        }
      }
    },
    async (_request, reply) => {
      const status = appStatusResponseSchema.parse(await statusService.start());
      return reply.code(status.state === 'Online' ? 200 : 202).send(status);
    }
  );
}
