import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  type Generation,
  generationSchema,
  updateGenerationRequestSchema
} from '../../../../shared/generations.js';
import { isEditableGenerationStatus } from '../../../generations/editable-statuses.js';
import { pickNonModelPresetParams } from '../../../generations/preset-params.js';
import { resolvePresetParams } from '../../../presets/preset-params-resolver.js';
import {
  PresetParamsValidationError,
  validateCreatePresetParams
} from '../../../presets/preset-params-validator.js';
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

const updateGenerationWarningMessage = 'generation update rejected';
const updateGenerationWarningCode = 'generation_update_not_allowed';
const updateGenerationRouteSchema = {
  tags: ['generations'],
  summary: 'Update editable generation',
  params: generationParamsSchema,
  body: updateGenerationRequestSchema,
  response: generationValidationResponseSchemas
};

export function registerUpdateGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.patch(
    '/api/generations/:generationId',
    {
      schema: updateGenerationRouteSchema
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
          updateGenerationWarningMessage,
          request.params.generationId
        );
      }

      if (!isEditableGenerationStatus(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: updateGenerationWarningMessage,
          generation,
          warningCode: updateGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be updated in status "${generation.status}".`
        });
      }

      const preset = options.presetCatalog.getById(request.body.presetId);
      if (preset === undefined) {
        logGenerationWarning(request, updateGenerationWarningMessage, {
          generationId: generation.id,
          presetId: request.body.presetId,
          warningCode: 'preset_not_found'
        });
        return reply
          .code(404)
          .send({ message: `Preset "${request.body.presetId}" was not found.` });
      }

      let updateInput: {
        presetId: string;
        templateId: string;
        presetParams: Record<string, unknown>;
      };
      try {
        updateInput = buildEditableGenerationUpdate({
          generation,
          preset,
          presetId: request.body.presetId,
          presetParams: request.body.presetParams
        });
      } catch (error) {
        if (error instanceof PresetParamsValidationError) {
          logGenerationWarning(request, updateGenerationWarningMessage, {
            generationId: generation.id,
            presetId: request.body.presetId,
            warningCode: 'generation_validation_failed',
            validationIssue: error.message
          });
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }

      const updated = await options.store.updateEditableGeneration(
        generation.id,
        updateInput
      );
      if (updated === undefined) {
        const current = await options.store.getById(generation.id);
        if (current === undefined) {
          return sendGenerationNotFound(
            request,
            reply,
            updateGenerationWarningMessage,
            generation.id
          );
        }

        if (!isEditableGenerationStatus(current.status)) {
          return sendGenerationStatusConflict({
            request,
            reply,
            warningMessage: updateGenerationWarningMessage,
            generation: current,
            warningCode: updateGenerationWarningCode,
            responseMessage: `Generation "${current.id}" cannot be updated in status "${current.status}".`
          });
        }

        return sendGenerationCurrentStateConflict({
          request,
          reply,
          warningMessage: updateGenerationWarningMessage,
          generation,
          warningCode: updateGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot be updated in its current state.`
        });
      }

      publishUpdatedGeneration(options, request, updated);

      return generationSchema.parse(updated);
    }
  );
}

function buildEditableGenerationUpdate(input: {
  generation: {
    presetId: string;
    presetParams: Record<string, unknown>;
  };
  preset: {
    templateId: string;
  };
  presetId: string;
  presetParams: Record<string, unknown>;
}) {
  const preservedRuntimeParams =
    input.generation.presetId === input.presetId
      ? pickNonModelPresetParams(input.generation.presetParams, input.preset)
      : {};
  const resolvedParams = resolvePresetParams({
    preset: input.preset,
    systemParams: preservedRuntimeParams,
    userParams: input.presetParams
  });

  validateCreatePresetParams({
    preset: input.preset,
    rawParams: input.presetParams,
    resolvedParams
  });

  return {
    presetId: input.presetId,
    templateId: input.preset.templateId,
    presetParams: resolvedParams
  };
}

function publishUpdatedGeneration(
  options: RegisterGenerationRoutesOptions,
  request: { log: { info: FastifyInstance['log']['info'] } },
  generation: Generation
): void {
  publishGenerationUpsert(options.eventBus, generation);
  request.log.info(
    {
      generationId: generation.id,
      presetId: generation.presetId,
      templateId: generation.templateId
    },
    'generation updated'
  );
}
