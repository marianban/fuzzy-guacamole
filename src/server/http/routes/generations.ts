import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createGenerationRequestSchema,
  type Generation,
  generationListResponseSchema,
  generationSchema,
  updateGenerationRequestSchema
} from '../../../shared/generations.js';
import { ComfyClient } from '../../comfy/client.js';
import type { AppConfig } from '../../config/app-config.js';
import type { GenerationEventBus } from '../../generations/events.js';
import type { GenerationStore } from '../../generations/store.js';
import { isEditableGenerationStatus } from '../../generations/editable-statuses.js';
import {
  buildGenerationExecution,
  GenerationExecutionValidationError
} from '../../generations/execution/builder.js';
import {
  PresetParamsValidationError,
  validateCreatePresetParams
} from '../../presets/preset-params-validator.js';
import { resolvePresetParams } from '../../presets/preset-params-resolver.js';
import type { PresetCatalog } from '../../presets/preset-catalog.js';
import { resolveGenerationArtifactPath } from '../../generations/artifact-paths.js';
import { pickNonModelPresetParams } from '../../generations/preset-params.js';

const generationParamsSchema = z.object({
  generationId: z.uuid()
});

const errorResponseSchema = z.object({
  message: z.string(),
  issues: z.array(z.string()).optional()
});

const generationConflictResponseSchemas = {
  404: errorResponseSchema,
  409: errorResponseSchema
};

const generationResponseSchemas = {
  200: generationSchema,
  ...generationConflictResponseSchemas
};

const generationValidationResponseSchemas = {
  400: errorResponseSchema,
  ...generationResponseSchemas
};

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
        return sendGenerationNotFound(
          request,
          reply,
          'generation lookup failed',
          request.params.generationId
        );
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

  typed.post(
    '/api/generations/:generationId/queue',
    {
      schema: {
        tags: ['generations'],
        summary: 'Queue generation',
        params: generationParamsSchema,
        response: generationValidationResponseSchemas
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation queue rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'queued' || generation.status === 'submitted') {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation queue rejected',
          generation,
          warningCode: 'generation_queue_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be queued in status "${generation.status}".`
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
        const execution = await buildGenerationExecution({
          generation,
          preset
        });

        const updated = await options.store.markQueued(generation.id, {
          queuedAt: new Date().toISOString(),
          presetParams: execution.resolvedParams,
          executionSnapshot: execution
        });
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation queue rejected',
            generation,
            warningCode: 'generation_queue_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be queued in its current state.`
          });
        }
        publishGenerationUpsert(options.eventBus, updated);
        request.log.info(
          {
            generationId: updated.id,
            queuedAt: updated.queuedAt,
            status: updated.status
          },
          'generation queued'
        );

        return generationSchema.parse(updated);
      } catch (error) {
        if (error instanceof GenerationExecutionValidationError) {
          logGenerationWarning(request, 'generation queue rejected', {
            generationId: generation.id,
            warningCode: 'generation_queue_validation_failed',
            validationIssue: error.message,
            validationIssues: error.issues
          });
          return reply.code(400).send({
            message: error.message,
            issues: error.issues
          });
        }
        throw error;
      }
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
          ...generationResponseSchemas,
          503: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation cancel rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'queued') {
        const updated = await options.store.markCanceled(generation.id);
        if (updated === undefined) {
          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation cancel rejected',
            generation,
            warningCode: 'generation_cancel_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }
        publishGenerationUpsert(options.eventBus, updated);
        request.log.info(
          {
            generationId: updated.id,
            status: updated.status
          },
          'generation canceled'
        );
        return generationSchema.parse(updated);
      }

      if (generation.status === 'submitted') {
        const comfyClient = createComfyClient(options.config);

        try {
          await comfyClient.interrupt();
        } catch (error) {
          const failed = await options.store.markFailed(
            generation.id,
            `Cancel failure: ${error instanceof Error ? error.message : String(error)}`
          );

          if (failed !== undefined) {
            publishGenerationUpsert(options.eventBus, failed);
            request.log.warn(
              {
                generationId: failed.id,
                error: failed.error
              },
              'generation cancel failed'
            );
            return generationSchema.parse(failed);
          }

          throw error;
        }

        const canceled = await options.store.markCanceled(generation.id);
        if (canceled === undefined) {
          const current = await options.store.getById(generation.id);
          if (current !== undefined && isTerminalGenerationStatus(current.status)) {
            request.log.info(
              {
                generationId: current.id,
                status: current.status
              },
              'generation cancel resolved after concurrent terminal transition'
            );
            return generationSchema.parse(current);
          }

          return sendGenerationCurrentStateConflict({
            request,
            reply,
            warningMessage: 'generation cancel rejected',
            generation,
            warningCode: 'generation_cancel_not_allowed',
            responseMessage: `Generation "${generation.id}" cannot be canceled in its current state.`
          });
        }

        publishGenerationUpsert(options.eventBus, canceled);
        request.log.info(
          {
            generationId: canceled.id,
            status: canceled.status
          },
          'generation canceled'
        );

        return generationSchema.parse(canceled);
      }

      return sendGenerationStatusConflict({
        request,
        reply,
        warningMessage: 'generation cancel rejected',
        generation,
        warningCode: 'generation_cancel_not_allowed',
        responseMessage: `Generation "${generation.id}" cannot be canceled in status "${generation.status}".`
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
          ...generationConflictResponseSchemas
        }
      }
    },
    async (request, reply) => {
      const generation = await getGenerationByIdOrSendNotFound(
        options.store,
        request,
        reply,
        'generation delete rejected',
        request.params.generationId
      );
      if (generation === undefined) {
        return;
      }

      if (generation.status === 'submitted') {
        return sendGenerationStatusConflict({
          request,
          reply,
          warningMessage: 'generation delete rejected',
          generation,
          warningCode: 'generation_delete_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      const deleted = await options.store.deleteDeletable(generation.id);
      if (!deleted) {
        return sendGenerationCurrentStateConflict({
          request,
          reply,
          warningMessage: 'generation delete rejected',
          generation,
          warningCode: 'generation_delete_not_allowed',
          responseMessage: `Generation "${generation.id}" cannot be deleted while submitted.`
        });
      }

      if (options.config !== undefined) {
        await cleanupGenerationArtifacts(options.config, generation.id);
      }
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

async function getGenerationByIdOrSendNotFound(
  store: GenerationStore,
  request: FastifyRequest,
  reply: FastifyReply,
  warningMessage: string,
  generationId: string
): Promise<Generation | undefined> {
  const generation = await store.getById(generationId);
  if (generation === undefined) {
    sendGenerationNotFound(request, reply, warningMessage, generationId);
  }

  return generation;
}

function sendGenerationNotFound(
  request: FastifyRequest,
  reply: FastifyReply,
  warningMessage: string,
  generationId: string
) {
  logGenerationWarning(request, warningMessage, {
    generationId,
    warningCode: 'generation_not_found'
  });
  return reply.code(404).send({
    message: `Generation "${generationId}" was not found.`
  });
}

interface SendGenerationConflictOptions {
  request: FastifyRequest;
  reply: FastifyReply;
  warningMessage: string;
  generation: Generation;
  warningCode: string;
  responseMessage: string;
}

function sendGenerationStatusConflict({
  request,
  reply,
  warningMessage,
  generation,
  warningCode,
  responseMessage
}: SendGenerationConflictOptions) {
  logGenerationWarning(request, warningMessage, {
    generationId: generation.id,
    status: generation.status,
    warningCode
  });
  return reply.code(409).send({
    message: responseMessage
  });
}

function sendGenerationCurrentStateConflict({
  request,
  reply,
  warningMessage,
  generation,
  warningCode,
  responseMessage
}: SendGenerationConflictOptions) {
  logGenerationWarning(request, warningMessage, {
    generationId: generation.id,
    warningCode
  });
  return reply.code(409).send({
    message: responseMessage
  });
}

function publishGenerationUpsert(
  eventBus: GenerationEventBus,
  generation: Generation
): void {
  eventBus.publish({
    type: 'upsert',
    generationId: generation.id,
    generation
  });
}

async function cleanupGenerationArtifacts(
  config: AppConfig,
  generationId: string
): Promise<void> {
  await Promise.all([
    rm(resolveGenerationArtifactPath(config.paths.inputs, generationId), {
      recursive: true,
      force: true
    }),
    rm(resolveGenerationArtifactPath(config.paths.outputs, generationId), {
      recursive: true,
      force: true
    })
  ]);
}

function isTerminalGenerationStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

function createComfyClient(config: AppConfig | undefined): ComfyClient {
  if (config === undefined) {
    throw new Error('Comfy client is unavailable because route config is missing.');
  }

  return new ComfyClient({ baseUrl: config.comfyBaseUrl });
}
