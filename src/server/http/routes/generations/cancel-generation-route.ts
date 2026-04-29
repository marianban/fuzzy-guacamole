import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { generationSchema } from '../../../../shared/generations.js';
import {
  createComfyClient,
  getGenerationByIdOrSendNotFound,
  isTerminalGenerationStatus,
  publishGenerationUpsert,
  sendGenerationCurrentStateConflict,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  errorResponseSchema,
  generationParamsSchema,
  generationResponseSchemas
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerCancelGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/cancel',
    {
      schema: {
        tags: ['generations'],
        summary: 'Cancel generation',
        params: generationParamsSchema,
        response: {
          ...generationResponseSchemas,
          503: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation cancel rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'queued') {
        const updated = await options.store.markCanceled(generation.id);
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation cancel rejected',
            generation,
            warningCode: 'generation_cancel_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }
        publishGenerationUpsert(options.eventBus, updated);
        request.log.info(
          {
            generationId: updated.id,
            status: updated.status
          },
          'generation canceled'
        );
        return generationSchema.parse(updated);
      }

      if (generation.status === 'submitted') {
        const comfyClient = createComfyClient(options.config);

        try {
          await comfyClient.interrupt();
        } catch (error) {
          const failed = await options.store.markFailed(
            generation.id,
            `Cancel failure: ${error instanceof Error ? error.message : String(error)}`
          );

          if (failed !== undefined) {
            publishGenerationUpsert(options.eventBus, failed);
            request.log.warn(
              {
                generationId: failed.id,
                error: failed.error
              },
              'generation cancel failed'
            );
            return generationSchema.parse(failed);
          }

          throw error;
        }

        const canceled = await options.store.markCanceled(generation.id);
        if (canceled === undefined) {
          const current = await options.store.getById(generation.id);
          if (current !== undefined && isTerminalGenerationStatus(current.status)) {
            request.log.info(
              {
                generationId: current.id,
                status: current.status
              },
              'generation cancel resolved after concurrent terminal transition'
            );
            return generationSchema.parse(current);
          }

          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation cancel rejected',
            generation,
            warningCode: 'generation_cancel_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }

        publishGenerationUpsert(options.eventBus, canceled);
        request.log.info(
          {
            generationId: canceled.id,
            status: canceled.status
          },
          'generation canceled'
        );

        return generationSchema.parse(canceled);
      }

      return sendGenerationStatusConflict({
        request,
        reply,
        warningMessage: 'generation cancel rejected',
        generation,
        warningCode: 'generation_cancel_not_allowed',
        responseMessage: `Generation "${generation.id}" cannot be canceled in status "${generation.status}".`
      });
    }
  );
}
