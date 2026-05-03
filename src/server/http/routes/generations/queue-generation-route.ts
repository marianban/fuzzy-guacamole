import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  type Generation,
  type GenerationStatus,
  generationSchema
} from '../../../../shared/generations.js';
import {
  buildGenerationExecution,
  GenerationExecutionValidationError
} from '../../../generations/execution/builder.js';
import {
  getGenerationById,
  logGenerationWarning,
  publishGenerationUpsert,
  sendGenerationCurrentStateConflict,
  sendGenerationNotFound,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  generationParamsSchema,
  generationValidationResponseSchemas
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

const queueGenerationWarningMessage = 'generation queue rejected';
const queueGenerationWarningCode = 'generation_queue_not_allowed';
const queueGenerationRouteSchema = {
  tags: ['generations'],
  summary: 'Queue generation',
  params: generationParamsSchema,
  response: generationValidationResponseSchemas
};

function isQueueableGenerationStatus(status: GenerationStatus): boolean {
  return (
    status === 'draft' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'canceled'
  );
}

export function registerQueueGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/queue',
    {
      schema: queueGenerationRouteSchema
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
          queueGenerationWarningMessage,
          request.params.generationId
        );
      }

      if (!isQueueableGenerationStatus(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: queueGenerationWarningMessage,
          generation,
          warningCode: queueGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be queued in status "${generation.status}".`
        });
      }

      const preset = options.presetCatalog.getById(generation.presetId);
      if (preset === undefined) {
        logGenerationWarning(request, queueGenerationWarningMessage, {
          generationId: generation.id,
          presetId: generation.presetId,
          warningCode: 'preset_not_found'
        });
        return reply.code(404).send({
          message: `Preset "${generation.presetId}" was not found.`
        });
      }

      try {
        const updated = await queueGeneration(options, generation, preset);
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: queueGenerationWarningMessage,
            generation,
            warningCode: queueGenerationWarningCode,
            responseMessage: `Generation "${generation.id}" cannot be queued in its current state.`
          });
        }
        publishQueuedGeneration(options, request, updated);

        return generationSchema.parse(updated);
      } catch (error) {
        if (error instanceof GenerationExecutionValidationError) {
          logGenerationWarning(request, queueGenerationWarningMessage, {
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

async function queueGeneration(
  options: RegisterGenerationRoutesOptions,
  generation: Parameters<typeof buildGenerationExecution>[0]['generation'],
  preset: Parameters<typeof buildGenerationExecution>[0]['preset']
) {
  const execution = await buildGenerationExecution({
    generation,
    preset
  });

  return options.store.markQueued(generation.id, {
    queuedAt: new Date().toISOString(),
    presetParams: execution.resolvedParams,
    executionSnapshot: execution
  });
}

function publishQueuedGeneration(
  options: RegisterGenerationRoutesOptions,
  request: { log: { info: FastifyInstance['log']['info'] } },
  generation: Generation
): void {
  publishGenerationUpsert(options.eventBus, generation);
  request.log.info(
    {
      generationId: generation.id,
      queuedAt: generation.queuedAt,
      status: generation.status
    },
    'generation queued'
  );
}
