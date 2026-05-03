import { rm } from 'node:fs/promises';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { ComfyClient } from '../../../comfy/client.js';
import type { AppConfig } from '../../../config/app-config.js';
import { resolveGenerationArtifactPath } from '../../../generations/artifact-paths.js';
import type { GenerationEventBus } from '../../../generations/events.js';
import type { Generation } from '../../../../shared/generations.js';
import type { GenerationStore } from '../../../generations/store.js';

export function logGenerationWarning(
  request: FastifyRequest,
  message: string,
  context: Record<string, unknown>
): void {
  request.log.warn(context, message);
}

export function getGenerationById(
  store: GenerationStore,
  generationId: string
): Promise<Generation | undefined> {
  return store.getById(generationId);
}

export function sendGenerationNotFound(
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

export function sendGenerationStatusConflict({
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

export function sendGenerationCurrentStateConflict({
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

export function publishGenerationUpsert(
  eventBus: GenerationEventBus,
  generation: Generation
): void {
  eventBus.publish({
    type: 'upsert',
    generationId: generation.id,
    generation
  });
}

export async function cleanupGenerationArtifacts(
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

export function isTerminalGenerationStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

export function createComfyClient(config: AppConfig | undefined): ComfyClient {
  if (config === undefined) {
    throw new Error('Comfy client is unavailable because route config is missing.');
  }

  return new ComfyClient({ baseUrl: config.comfyBaseUrl });
}
