import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  createGenerationRequestSchema,
  generationSchema
} from '../../../../shared/generations.js';
import {
  PresetParamsValidationError,
  validateCreatePresetParams
} from '../../../presets/preset-params-validator.js';
import { resolvePresetParams } from '../../../presets/preset-params-resolver.js';
import { logGenerationWarning, publishGenerationUpsert } from './route-helpers.js';
import { errorResponseSchema } from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerCreateGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations',
    {
      schema: {
        tags: ['generations'],
        summary: 'Create generation',
        body: createGenerationRequestSchema,
        response: {
          400: errorResponseSchema,
          201: generationSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const preset = options.presetCatalog.getById(request.body.presetId);
      if (preset === undefined) {
        request.log.warn(
          {
            presetId: request.body.presetId,
            warningCode: 'preset_not_found'
          },
          'generation creation rejected'
        );
        return reply
          .code(404)
          .send({ message: `Preset "${request.body.presetId}" was not found.` });
      }

      let resolvedParams: Record<string, unknown>;
      try {
        resolvedParams = resolvePresetParams({
          preset,
          userParams: request.body.presetParams
        });
        validateCreatePresetParams({
          preset,
          rawParams: request.body.presetParams,
          resolvedParams
        });
      } catch (error) {
        if (error instanceof PresetParamsValidationError) {
          logGenerationWarning(request, 'generation creation rejected', {
            presetId: request.body.presetId,
            warningCode: 'generation_validation_failed',
            validationIssue: error.message
          });
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }

      const generation = await options.store.create({
        presetId: request.body.presetId,
        templateId: preset.templateId,
        // Persist resolved defaults so later reads and queue execution use the same snapshot.
        presetParams: resolvedParams
      });
      publishGenerationUpsert(options.eventBus, generation);
      request.log.info(
        {
          generationId: generation.id,
          presetId: generation.presetId,
          templateId: generation.templateId
        },
        'generation created'
      );

      return reply.code(201).send(generationSchema.parse(generation));
    }
  );
}
