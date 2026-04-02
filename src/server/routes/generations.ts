import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createGenerationRequestSchema,
  generationListResponseSchema,
  generationSchema
} from '../../shared/generations.js';
import type { AppConfig } from '../config.js';
import type { GenerationEventBus } from '../generations/events.js';
import type { GenerationStore } from '../generations/store.js';
import type { PresetCatalog } from '../presets.js';

const generationParamsSchema = z.object({
  generationId: z.uuid()
});

const errorResponseSchema = z.object({
  message: z.string()
});

export interface RegisterGenerationRoutesOptions {
  config: AppConfig | undefined;
  presetCatalog: PresetCatalog;
  store: GenerationStore;
  eventBus: GenerationEventBus;
}

export function registerGenerationRoutes(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/generations',
    {
      schema: {
        tags: ['generations'],
        summary: 'List generations',
        response: {
          200: generationListResponseSchema
        }
      }
    },
    async () =>
      generationListResponseSchema.parse(await options.store.list())
  );

  typed.get(
    '/api/generations/:generationId',
    {
      schema: {
        tags: ['generations'],
        summary: 'Get generation by id',
        params: generationParamsSchema,
        response: {
          200: generationSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      return generationSchema.parse(generation);
    }
  );

  typed.post(
    '/api/generations',
    {
      schema: {
        tags: ['generations'],
        summary: 'Create generation',
        body: createGenerationRequestSchema,
        response: {
          201: generationSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const preset = options.presetCatalog.getById(request.body.presetId);
      if (preset === undefined) {
        return reply
          .code(404)
          .send({ message: `Preset "${request.body.presetId}" was not found.` });
      }

      const generation = await options.store.create({
        presetId: request.body.presetId,
        templateId: preset.templateId,
        presetParams: request.body.presetParams
      });
      options.eventBus.publish({
        type: 'upsert',
        generationId: generation.id,
        generation
      });

      return reply.code(201).send(generationSchema.parse(generation));
    }
  );

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
          404: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot accept input in status "${generation.status}".`
        });
      }

      if (options.config === undefined) {
        return reply.code(503).send({
          message: 'Input upload is unavailable because config is missing.'
        });
      }

      const filePart = await request.file();
      if (filePart === undefined) {
        return reply.code(400).send({
          message: 'Multipart field "file" is required.'
        });
      }

      const safeFileName =
        filePart.filename !== undefined && filePart.filename.length > 0
          ? path.basename(filePart.filename)
          : 'input.bin';
      const targetDir = path.resolve(
        options.config.paths.inputs,
        generation.id,
        'original'
      );
      await mkdir(targetDir, { recursive: true });
      const targetPath = path.resolve(targetDir, safeFileName);

      await pipeline(filePart.file, createWriteStream(targetPath));

      const updated = {
        ...generation,
        presetParams: {
          ...generation.presetParams,
          inputImagePath: targetPath
        },
        updatedAt: new Date().toISOString()
      };
      await options.store.save(updated);
      options.eventBus.publish({
        type: 'upsert',
        generationId: updated.id,
        generation: updated
      });

      return reply.code(204).send();
    }
  );

  typed.post(
    '/api/generations/:generationId/queue',
    {
      schema: {
        tags: ['generations'],
        summary: 'Queue generation',
        params: generationParamsSchema,
        response: {
          200: generationSchema,
          404: errorResponseSchema,
          409: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot be queued in status "${generation.status}".`
        });
      }

      const now = new Date().toISOString();
      const updated = {
        ...generation,
        status: 'queued' as const,
        queuedAt: now,
        updatedAt: now,
        error: null
      };
      await options.store.save(updated);
      options.eventBus.publish({
        type: 'upsert',
        generationId: updated.id,
        generation: updated
      });

      return generationSchema.parse(updated);
    }
  );

  typed.post(
    '/api/generations/:generationId/cancel',
    {
      schema: {
        tags: ['generations'],
        summary: 'Cancel generation',
        params: generationParamsSchema,
        response: {
          200: generationSchema,
          404: errorResponseSchema,
          409: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'queued') {
        const updated = {
          ...generation,
          status: 'canceled' as const,
          updatedAt: new Date().toISOString()
        };
        await options.store.save(updated);
        options.eventBus.publish({
          type: 'upsert',
          generationId: updated.id,
          generation: updated
        });
        return generationSchema.parse(updated);
      }

      return reply.code(409).send({
        message: `Generation "${generation.id}" cannot be canceled in status "${generation.status}".`
      });
    }
  );

  typed.delete(
    '/api/generations/:generationId',
    {
      schema: {
        tags: ['generations'],
        summary: 'Delete generation',
        params: generationParamsSchema,
        response: {
          204: z.null(),
          404: errorResponseSchema,
          409: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'submitted') {
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      await options.store.delete(generation.id);
      options.eventBus.publish({
        type: 'deleted',
        generationId: generation.id
      });

      return reply.code(204).send(null);
    }
  );
}
