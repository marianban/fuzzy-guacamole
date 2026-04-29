import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  cleanupGenerationArtifacts,
  getGenerationByIdOrSendNotFound,
  sendGenerationCurrentStateConflict,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  generationConflictResponseSchemas,
  generationParamsSchema
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerDeleteGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.delete(
    '/api/generations/:generationId',
    {
      schema: {
        tags: ['generations'],
        summary: 'Delete generation',
        params: generationParamsSchema,
        response: {
          204: z.null(),
          ...generationConflictResponseSchemas
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation delete rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'submitted') {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation delete rejected',
          generation,
          warningCode: 'generation_delete_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      const deleted = await options.store.deleteDeletable(generation.id);
      if (!deleted) {
        return sendGenerationCurrentStateConflict({
          request,
          reply,
          warningMessage: 'generation delete rejected',
          generation,
          warningCode: 'generation_delete_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      if (options.config !== undefined) {
        await cleanupGenerationArtifacts(options.config, generation.id);
      }
      options.eventBus.publish({
        type: 'deleted',
        generationId: generation.id
      });
      request.log.info(
        {
          generationId: generation.id
        },
        'generation deleted'
      );

      return reply.code(204).send(null);
    }
  );
}
