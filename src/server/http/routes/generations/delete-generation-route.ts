import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { GenerationStatus } from '../../../../shared/generations.js';

import {
  cleanupGenerationArtifacts,
  getGenerationById,
  sendGenerationCurrentStateConflict,
  sendGenerationNotFound,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  generationConflictResponseSchemas,
  generationParamsSchema
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

const deleteGenerationWarningMessage = 'generation delete rejected';
const deleteGenerationWarningCode = 'generation_delete_not_allowed';
const deleteGenerationRouteSchema = {
  tags: ['generations'],
  summary: 'Delete generation',
  params: generationParamsSchema,
  response: {
    204: z.null(),
    ...generationConflictResponseSchemas
  }
};

function isDeletableGenerationStatus(status: GenerationStatus): boolean {
  return status !== 'submitted';
}

export function registerDeleteGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.delete(
    '/api/generations/:generationId',
    {
      schema: deleteGenerationRouteSchema
    },
    async (request, reply) => {
      const generation = await getGenerationById(
        options.store,
        request.params.generationId
      );
      if (generation === undefined) {
        return sendGenerationNotFound(
          request,
          reply,
          deleteGenerationWarningMessage,
          request.params.generationId
        );
      }

      if (!isDeletableGenerationStatus(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: deleteGenerationWarningMessage,
          generation,
          warningCode: deleteGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      const deleted = await options.store.deleteDeletable(generation.id);
      if (!deleted) {
        return sendGenerationCurrentStateConflict({
          request,
          reply,
          warningMessage: deleteGenerationWarningMessage,
          generation,
          warningCode: deleteGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      await finalizeDeletedGeneration(options, request, generation.id);

      return reply.code(204).send(null);
    }
  );
}

async function finalizeDeletedGeneration(
  options: RegisterGenerationRoutesOptions,
  request: { log: { info: FastifyInstance['log']['info'] } },
  generationId: string
): Promise<void> {
  if (options.config !== undefined) {
    await cleanupGenerationArtifacts(options.config, generationId);
  }
  options.eventBus.publish({
    type: 'deleted',
    generationId
  });
  request.log.info(
    {
      generationId
    },
    'generation deleted'
  );
}
