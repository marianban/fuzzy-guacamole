import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  type Generation,
  type GenerationStatus,
  generationSchema
} from '../../../../shared/generations.js';
import {
  createComfyClient,
  getGenerationById,
  isTerminalGenerationStatus,
  publishGenerationUpsert,
  sendGenerationCurrentStateConflict,
  sendGenerationNotFound,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  errorResponseSchema,
  generationParamsSchema,
  generationResponseSchemas
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

const cancelGenerationWarningMessage = 'generation cancel rejected';
const cancelGenerationWarningCode = 'generation_cancel_not_allowed';
const cancelGenerationRouteSchema = {
  tags: ['generations'],
  summary: 'Cancel generation',
  params: generationParamsSchema,
  response: {
    ...generationResponseSchemas,
    503: errorResponseSchema
  }
};

type SubmittedCancelResult =
  | { kind: 'failed'; generation: Generation }
  | { kind: 'canceled'; generation: Generation }
  | { kind: 'terminal'; generation: Generation }
  | { kind: 'conflict' };

type CancelableGenerationStatus = Extract<GenerationStatus, 'queued' | 'submitted'>;

function isCancelableGenerationStatus(
  status: GenerationStatus
): status is CancelableGenerationStatus {
  return status === 'queued' || status === 'submitted';
}

export function registerCancelGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/cancel',
    {
      schema: cancelGenerationRouteSchema
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
          cancelGenerationWarningMessage,
          request.params.generationId
        );
      }

      if (!isCancelableGenerationStatus(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: cancelGenerationWarningMessage,
          generation,
          warningCode: cancelGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be canceled in status "${generation.status}".`
        });
      }

      if (generation.status === 'queued') {
        const updated = await options.store.markCanceled(generation.id);
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: cancelGenerationWarningMessage,
            generation,
            warningCode: cancelGenerationWarningCode,
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }

        return publishCanceledGeneration(options, request, updated);
      }

      if (generation.status === 'submitted') {
        const result = await cancelSubmittedGeneration(options, generation);
        if (result.kind === 'failed') {
          return publishFailedGenerationCancel(options, request, result.generation);
        }
        if (result.kind === 'terminal') {
          return publishConcurrentTerminalCancelResolution(request, result.generation);
        }
        if (result.kind === 'conflict') {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: cancelGenerationWarningMessage,
            generation,
            warningCode: cancelGenerationWarningCode,
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }

        return publishCanceledGeneration(options, request, result.generation);
      }
    }
  );
}

async function cancelSubmittedGeneration(
  options: RegisterGenerationRoutesOptions,
  generation: Generation
): Promise<SubmittedCancelResult> {
  const comfyClient = createComfyClient(options.config);

  try {
    await comfyClient.interrupt();
  } catch (error) {
    const failed = await options.store.markFailed(
      generation.id,
      `Cancel failure: ${error instanceof Error ? error.message : String(error)}`
    );

    if (failed !== undefined) {
      return {
        kind: 'failed',
        generation: failed
      };
    }

    throw error;
  }

  const canceled = await options.store.markCanceled(generation.id);
  if (canceled !== undefined) {
    return {
      kind: 'canceled',
      generation: canceled
    };
  }

  const current = await options.store.getById(generation.id);
  if (current !== undefined && isTerminalGenerationStatus(current.status)) {
    return {
      kind: 'terminal',
      generation: current
    };
  }

  return {
    kind: 'conflict'
  };
}

function publishCanceledGeneration(
  options: RegisterGenerationRoutesOptions,
  request: { log: { info: FastifyInstance['log']['info'] } },
  generation: Generation
) {
  publishGenerationUpsert(options.eventBus, generation);
  request.log.info(
    {
      generationId: generation.id,
      status: generation.status
    },
    'generation canceled'
  );

  return generationSchema.parse(generation);
}

function publishFailedGenerationCancel(
  options: RegisterGenerationRoutesOptions,
  request: {
    log: {
      warn: FastifyInstance['log']['warn'];
    };
  },
  generation: Generation
) {
  publishGenerationUpsert(options.eventBus, generation);
  request.log.warn(
    {
      generationId: generation.id,
      error: generation.error
    },
    'generation cancel failed'
  );

  return generationSchema.parse(generation);
}

function publishConcurrentTerminalCancelResolution(
  request: { log: { info: FastifyInstance['log']['info'] } },
  generation: Generation
) {
  request.log.info(
    {
      generationId: generation.id,
      status: generation.status
    },
    'generation cancel resolved after concurrent terminal transition'
  );

  return generationSchema.parse(generation);
}
