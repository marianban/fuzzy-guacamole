import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { generationSchema } from '../../../../shared/generations.js';
import {
  buildGenerationExecution,
  GenerationExecutionValidationError
} from '../../../generations/execution/builder.js';
import {
  getGenerationByIdOrSendNotFound,
  logGenerationWarning,
  publishGenerationUpsert,
  sendGenerationCurrentStateConflict,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  generationParamsSchema,
  generationValidationResponseSchemas
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerQueueGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/queue',
    {
      schema: {
        tags: ['generations'],
        summary: 'Queue generation',
        params: generationParamsSchema,
        response: generationValidationResponseSchemas
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation queue rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation queue rejected',
          generation,
          warningCode: 'generation_queue_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be queued in status "${generation.status}".`
        });
      }

      const preset = options.presetCatalog.getById(generation.presetId);
      if (preset === undefined) {
        logGenerationWarning(request, 'generation queue rejected', {
          generationId: generation.id,
          presetId: generation.presetId,
          warningCode: 'preset_not_found'
        });
        return reply.code(404).send({
          message: `Preset "${generation.presetId}" was not found.`
        });
      }

      try {
        const execution = await buildGenerationExecution({
          generation,
          preset
        });

        const updated = await options.store.markQueued(generation.id, {
          queuedAt: new Date().toISOString(),
          presetParams: execution.resolvedParams,
          executionSnapshot: execution
        });
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation queue rejected',
            generation,
            warningCode: 'generation_queue_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be queued in its current state.`
          });
        }
        publishGenerationUpsert(options.eventBus, updated);
        request.log.info(
          {
            generationId: updated.id,
            queuedAt: updated.queuedAt,
            status: updated.status
          },
          'generation queued'
        );

        return generationSchema.parse(updated);
      } catch (error) {
        if (error instanceof GenerationExecutionValidationError) {
          logGenerationWarning(request, 'generation queue rejected', {
            generationId: generation.id,
            warningCode: 'generation_queue_validation_failed',
            validationIssue: error.message,
            validationIssues: error.issues
          });
          return reply.code(400).send({
            message: error.message,
            issues: error.issues
          });
        }
        throw error;
      }
    }
  );
}
