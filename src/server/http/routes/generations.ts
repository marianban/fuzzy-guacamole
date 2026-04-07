import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createGenerationRequestSchema,
  generationListResponseSchema,
  generationSchema
} from '../../../shared/generations.js';
import type { AppConfig } from '../../config/app-config.js';
import type { GenerationEventBus } from '../../generations/events.js';
import type { GenerationStore } from '../../generations/store.js';
import {
  PresetParamsValidationError,
  validateCreatePresetParams,
  validateQueuePresetParams
} from '../../presets/preset-params-validator.js';
import { resolvePresetParams } from '../../presets/preset-params-resolver.js';
import type { PresetCatalog } from '../../presets/preset-catalog.js';

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
    async () => generationListResponseSchema.parse(await options.store.list())
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
        logGenerationWarning(request, 'generation lookup failed', {
          generationId: request.params.generationId,
          warningCode: 'generation_not_found'
        });
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

      try {
        const resolvedParams = resolvePresetParams({
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
        presetParams: request.body.presetParams
      });
      options.eventBus.publish({
        type: 'upsert',
        generationId: generation.id,
        generation
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
        logGenerationWarning(request, 'generation input rejected', {
          generationId: request.params.generationId,
          warningCode: 'generation_not_found'
        });
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        logGenerationWarning(request, 'generation input rejected', {
          generationId: generation.id,
          status: generation.status,
          warningCode: 'generation_input_not_allowed'
        });
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot accept input in status "${generation.status}".`
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

  typed.post(
    '/api/generations/:generationId/queue',
    {
      schema: {
        tags: ['generations'],
        summary: 'Queue generation',
        params: generationParamsSchema,
        response: {
          400: errorResponseSchema,
          200: generationSchema,
          404: errorResponseSchema,
          409: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await options.store.getById(request.params.generationId);
      if (generation === undefined) {
        logGenerationWarning(request, 'generation queue rejected', {
          generationId: request.params.generationId,
          warningCode: 'generation_not_found'
        });
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        logGenerationWarning(request, 'generation queue rejected', {
          generationId: generation.id,
          status: generation.status,
          warningCode: 'generation_queue_not_allowed'
        });
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot be queued in status "${generation.status}".`
        });
      }

      const preset = options.presetCatalog.getById(generation.presetId);
      if (preset === undefined) {
        logGenerationWarning(request, 'generation queue rejected', {
          generationId: generation.id,
          presetId: generation.presetId,
          warningCode: 'preset_not_found'
        });
        return reply.code(404).send({
          message: `Preset "${generation.presetId}" was not found.`
        });
      }

      try {
        const modelFieldIds = new Set(preset.model.fields.map((field) => field.id));
        const userParams: Record<string, unknown> = {};
        const systemParams: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(generation.presetParams)) {
          if (modelFieldIds.has(key)) {
            userParams[key] = value;
          } else {
            systemParams[key] = value;
          }
        }

        const resolvedParams = resolvePresetParams({
          preset,
          userParams,
          systemParams
        });
        validateQueuePresetParams({
          preset,
          resolvedParams,
          runtimeParamKeys: Object.keys(systemParams)
        });
      } catch (error) {
        if (error instanceof PresetParamsValidationError) {
          logGenerationWarning(request, 'generation queue rejected', {
            generationId: generation.id,
            warningCode: 'generation_queue_validation_failed',
            validationIssue: error.message
          });
          return reply.code(400).send({ message: error.message });
        }
        throw error;
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
      request.log.info(
        {
          generationId: updated.id,
          queuedAt: updated.queuedAt,
          status: updated.status
        },
        'generation queued'
      );

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
        logGenerationWarning(request, 'generation cancel rejected', {
          generationId: request.params.generationId,
          warningCode: 'generation_not_found'
        });
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
        request.log.info(
          {
            generationId: updated.id,
            status: updated.status
          },
          'generation canceled'
        );
        return generationSchema.parse(updated);
      }

      logGenerationWarning(request, 'generation cancel rejected', {
        generationId: generation.id,
        status: generation.status,
        warningCode: 'generation_cancel_not_allowed'
      });
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
        logGenerationWarning(request, 'generation delete rejected', {
          generationId: request.params.generationId,
          warningCode: 'generation_not_found'
        });
        return reply.code(404).send({
          message: `Generation "${request.params.generationId}" was not found.`
        });
      }

      if (generation.status === 'submitted') {
        logGenerationWarning(request, 'generation delete rejected', {
          generationId: generation.id,
          status: generation.status,
          warningCode: 'generation_delete_not_allowed'
        });
        return reply.code(409).send({
          message: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      await options.store.delete(generation.id);
      options.eventBus.publish({
        type: 'deleted',
        generationId: generation.id
      });
      request.log.info(
        {
          generationId: generation.id
        },
        'generation deleted'
      );

      return reply.code(204).send(null);
    }
  );
}

function logGenerationWarning(
  request: FastifyRequest,
  message: string,
  context: Record<string, unknown>
): void {
  request.log.warn(context, message);
}
