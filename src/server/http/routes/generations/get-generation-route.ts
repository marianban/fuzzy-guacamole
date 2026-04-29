import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { generationSchema } from '../../../../shared/generations.js';
import { getGenerationByIdOrSendNotFound } from './route-helpers.js';
import { errorResponseSchema, generationParamsSchema } from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerGetGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/generations/:generationId',
    {
      schema: {
        tags: ['generations'],
        summary: 'Get generation by id',
        params: generationParamsSchema,
        response: {
          200: generationSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation lookup failed',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      return generationSchema.parse(generation);
    }
  );
}
