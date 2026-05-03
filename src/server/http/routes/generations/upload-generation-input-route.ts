import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { GenerationStatus } from '../../../../shared/generations.js';

import { resolveGenerationArtifactPath } from '../../../generations/artifact-paths.js';
import {
  getGenerationById,
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

const uploadGenerationWarningMessage = 'generation input rejected';
const uploadGenerationWarningCode = 'generation_input_not_allowed';
const uploadGenerationInputRouteSchema = {
  tags: ['generations'],
  summary: 'Upload generation input image',
  params: generationParamsSchema,
  response: {
    204: z.void(),
    400: errorResponseSchema,
    ...generationConflictResponseSchemas,
    503: errorResponseSchema
  }
};

function canUploadGenerationInput(status: GenerationStatus): boolean {
  return (
    status === 'draft' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'canceled'
  );
}

interface UploadedGenerationInputFile {
  filename?: string;
  file: NodeJS.ReadableStream;
}

export function registerUploadGenerationInputRoute(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/generations/:generationId/input',
    {
      schema: uploadGenerationInputRouteSchema
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
          uploadGenerationWarningMessage,
          request.params.generationId
        );
      }

      if (!canUploadGenerationInput(generation.status)) {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: uploadGenerationWarningMessage,
          generation,
          warningCode: uploadGenerationWarningCode,
          responseMessage: `Generation "${generation.id}" cannot accept input in status "${generation.status}".`
        });
      }

      if (options.config === undefined) {
        logGenerationWarning(request, uploadGenerationWarningMessage, {
          generationId: generation.id,
          warningCode: 'config_missing'
        });
        return reply.code(503).send({
          message: 'Input upload is unavailable because config is missing.'
        });
      }

      const filePart = await request.file();
      if (filePart === undefined) {
        logGenerationWarning(request, uploadGenerationWarningMessage, {
          generationId: generation.id,
          warningCode: 'input_file_missing'
        });
        return reply.code(400).send({
          message: 'Multipart field "file" is required.'
        });
      }

      const targetPath = await storeUploadedGenerationInput({
        filePart,
        generationId: generation.id,
        inputsRoot: options.config.paths.inputs
      });

      const updated = await options.store.setInputImagePath(generation.id, targetPath);
      if (updated === undefined) {
        return sendGenerationNotFound(
          request,
          reply,
          uploadGenerationWarningMessage,
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

async function storeUploadedGenerationInput(input: {
  filePart: UploadedGenerationInputFile;
  generationId: string;
  inputsRoot: string;
}): Promise<string> {
  const safeFileName =
    input.filePart.filename !== undefined && input.filePart.filename.length > 0
      ? path.basename(input.filePart.filename)
      : 'input.bin';
  const targetDir = resolveGenerationArtifactPath(
    input.inputsRoot,
    input.generationId,
    'original'
  );
  await mkdir(targetDir, { recursive: true });

  const targetPath = path.resolve(targetDir, safeFileName);
  await pipeline(input.filePart.file, createWriteStream(targetPath));

  return targetPath;
}
