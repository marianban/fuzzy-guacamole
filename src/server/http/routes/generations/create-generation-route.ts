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

const createGenerationRouteSchema = {
  tags: ['generations'],
  summary: 'Create generation',
  body: createGenerationRequestSchema,
  response: {
    400: errorResponseSchema,
    201: generationSchema,
    404: errorResponseSchema
  }
};

export function registerCreateGenerationRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations',
    {
      schema: createGenerationRouteSchema
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

      try {
        const generation = await createGenerationFromRequest(options, {
          presetId: request.body.presetId,
          preset,
          presetParams: request.body.presetParams
        });

        request.log.info(
          {
            generationId: generation.id,
            presetId: generation.presetId,
            templateId: generation.templateId
          },
          'generation created'
        );

        return reply.code(201).send(generationSchema.parse(generation));
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
    }
  );
}

async function createGenerationFromRequest(
  options: RegisterGenerationRoutesOptions,
  input: {
    presetId: string;
    preset: { templateId: string };
    presetParams: Record<string, unknown>;
  }
) {
  const resolvedParams = resolveCreateGenerationParams(input.preset, input.presetParams);
  const generation = await options.store.create({
    presetId: input.presetId,
    templateId: input.preset.templateId,
    // Persist resolved defaults so later reads and queue execution use the same snapshot.
    presetParams: resolvedParams
  });
  publishGenerationUpsert(options.eventBus, generation);

  return generation;
}

function resolveCreateGenerationParams(
  preset: { templateId: string },
  rawParams: Record<string, unknown>
): Record<string, unknown> {
  const resolvedParams = resolvePresetParams({
    preset,
    userParams: rawParams
  });
  validateCreatePresetParams({
    preset,
    rawParams,
    resolvedParams
  });

  return resolvedParams;
}
