import type { FastifyInstance } from 'fastify';

import {
  presetDetailSchema,
  presetListResponseSchema
} from '../../shared/presets.js';
import type { PresetCatalog } from '../presets.js';

export function registerPresetRoutes(
  app: FastifyInstance,
  presetCatalog: PresetCatalog
): void {
  app.get('/api/presets', async () => {
    return presetListResponseSchema.parse(presetCatalog.list());
  });

  app.get('/api/presets/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string | undefined })['*'];
    if (wildcard === undefined || wildcard.length === 0) {
      return reply.code(400).send({ message: 'presetId path parameter is required.' });
    }

    const presetId = decodePresetId(wildcard);
    const preset = presetCatalog.getById(presetId);
    if (preset === undefined) {
      return reply
        .code(404)
        .send({ message: `Preset "${presetId}" was not found.` });
    }

    return presetDetailSchema.parse(preset);
  });
}

function decodePresetId(rawPresetId: string): string {
  try {
    return decodeURIComponent(rawPresetId);
  } catch {
    return rawPresetId;
  }
}
