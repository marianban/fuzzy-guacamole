import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { presetDetailSchema, presetListResponseSchema } from '../../shared/presets.js';
import type { PresetCatalog } from '../presets/preset-catalog.js';

const errorResponseSchema = z.object({
  message: z.string()
});

export function registerPresetRoutes(
  app: FastifyInstance,
  presetCatalog: PresetCatalog
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/presets',
    {
      schema: {
        tags: ['presets'],
        summary: 'List presets',
        response: {
          200: presetListResponseSchema
        }
      }
    },
    async () => presetListResponseSchema.parse(presetCatalog.list())
  );

  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/presets/*',
    {
      schema: {
        tags: ['presets'],
        summary: 'Get preset by id',
        response: {
          200: presetDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const wildcard = (request.params as { '*': string | undefined })['*'];
      if (wildcard === undefined || wildcard.length === 0) {
        return reply.code(400).send({ message: 'presetId path parameter is required.' });
      }

      const presetId = decodePresetId(wildcard);
      const preset = presetCatalog.getById(presetId);
      if (preset === undefined) {
        return reply.code(404).send({ message: `Preset "${presetId}" was not found.` });
      }

      return presetDetailSchema.parse(preset);
    }
  );
}

function decodePresetId(rawPresetId: string): string {
  try {
    return decodeURIComponent(rawPresetId);
  } catch {
    return rawPresetId;
  }
}
