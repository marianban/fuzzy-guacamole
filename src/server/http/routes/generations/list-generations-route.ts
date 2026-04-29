import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { generationListResponseSchema } from '../../../../shared/generations.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerListGenerationsRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/generations',
    {
      schema: {
        tags: ['generations'],
        summary: 'List generations',
        response: {
          200: generationListResponseSchema
        }
      }
    },
    async () => generationListResponseSchema.parse(await options.store.list())
  );
}
