import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { resolveGenerationArtifactPath } from '../../../generations/artifact-paths.js';
import {
  getGenerationByIdOrSendNotFound,
  logGenerationWarning,
  publishGenerationUpsert,
  sendGenerationNotFound,
  sendGenerationStatusConflict
} from './route-helpers.js';
import {
  errorResponseSchema,
  generationConflictResponseSchemas,
  generationParamsSchema
} from './route-schemas.js';
import type { RegisterGenerationRoutesOptions } from './route-types.js';

export function registerUploadGenerationInputRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/input',
    {
      schema: {
        tags: ['generations'],
        summary: 'Upload generation input image',
        params: generationParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          ...generationConflictResponseSchemas,
          503: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation input rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation input rejected',
          generation,
          warningCode: 'generation_input_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot accept input in status "${generation.status}".`
        });
      }

      if (options.config === undefined) {
        logGenerationWarning(request, 'generation input rejected', {
          generationId: generation.id,
          warningCode: 'config_missing'
        });
        return reply.code(503).send({
          message: 'Input upload is unavailable because config is missing.'
        });
      }

      const filePart = await request.file();
      if (filePart === undefined) {
        logGenerationWarning(request, 'generation input rejected', {
          generationId: generation.id,
          warningCode: 'input_file_missing'
        });
        return reply.code(400).send({
          message: 'Multipart field "file" is required.'
        });
      }

      const safeFileName =
        filePart.filename !== undefined && filePart.filename.length > 0
          ? path.basename(filePart.filename)
          : 'input.bin';
      const targetDir = resolveGenerationArtifactPath(
        options.config.paths.inputs,
        generation.id,
        'original'
      );
      await mkdir(targetDir, { recursive: true });
      const targetPath = path.resolve(targetDir, safeFileName);

      await pipeline(filePart.file, createWriteStream(targetPath));

      const updated = await options.store.setInputImagePath(generation.id, targetPath);
      if (updated === undefined) {
        return sendGenerationNotFound(
          request,
          reply,
          'generation input rejected',
          generation.id
        );
      }
      publishGenerationUpsert(options.eventBus, updated);
      request.log.info(
        {
          generationId: updated.id,
          inputImagePath: targetPath
        },
        'generation input stored'
      );

      return reply.code(204).send();
    }
  );
}
