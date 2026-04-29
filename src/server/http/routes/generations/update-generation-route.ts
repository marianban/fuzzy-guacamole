import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
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
  getGenerationByIdOrSendNotFound,
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

export function registerUpdateGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.patch(
    '/api/generations/:generationId',
    {
      schema: {
        tags: ['generations'],
        summary: 'Update editable generation',
        params: generationParamsSchema,
        body: updateGenerationRequestSchema,
        response: generationValidationResponseSchemas
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation update rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (!isEditableGenerationStatus(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation update rejected',
          generation,
          warningCode: 'generation_update_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be updated in status "${generation.status}".`
        });
      }

      const preset = options.presetCatalog.getById(request.body.presetId);
      if (preset === undefined) {
        logGenerationWarning(request, 'generation update rejected', {
          generationId: generation.id,
          presetId: request.body.presetId,
          warningCode: 'preset_not_found'
        });
        return reply
          .code(404)
          .send({ message: `Preset "${request.body.presetId}" was not found.` });
      }

      const preservedRuntimeParams =
        generation.presetId === request.body.presetId
          ? pickNonModelPresetParams(generation.presetParams, preset)
          : {};

      let resolvedParams: Record<string, unknown>;
      try {
        resolvedParams = resolvePresetParams({
          preset,
          systemParams: preservedRuntimeParams,
          userParams: request.body.presetParams
        });
        validateCreatePresetParams({
          preset,
          rawParams: request.body.presetParams,
          resolvedParams
        });
      } catch (error) {
        if (error instanceof PresetParamsValidationError) {
          logGenerationWarning(request, 'generation update rejected', {
            generationId: generation.id,
            presetId: request.body.presetId,
            warningCode: 'generation_validation_failed',
            validationIssue: error.message
          });
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }

      const updated = await options.store.updateEditableGeneration(generation.id, {
        presetId: request.body.presetId,
        templateId: preset.templateId,
        presetParams: resolvedParams
      });
      if (updated === undefined) {
        const current = await options.store.getById(generation.id);
        if (current === undefined) {
          return sendGenerationNotFound(
            request,
            reply,
            'generation update rejected',
            generation.id
          );
        }

        if (!isEditableGenerationStatus(current.status)) {
          return sendGenerationStatusConflict({
            request,
            reply,
            warningMessage: 'generation update rejected',
            generation: current,
            warningCode: 'generation_update_not_allowed',
            responseMessage: `Generation "${current.id}" cannot be updated in status "${current.status}".`
          });
        }

        return sendGenerationCurrentStateConflict({
          request,
          reply,
          warningMessage: 'generation update rejected',
          generation,
          warningCode: 'generation_update_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be updated in its current state.`
        });
      }

      publishGenerationUpsert(options.eventBus, updated);
      request.log.info(
        {
          generationId: updated.id,
          presetId: updated.presetId,
          templateId: updated.templateId
        },
        'generation updated'
      );

      return generationSchema.parse(updated);
    }
  );
}
