import type { Generation } from '../../shared/generations.js';
import type { GenerationExecutionPlan } from './execution/plan.js';

export interface StoredGeneration extends Generation {
  executionSnapshot: GenerationExecutionPlan | null;
  promptRequest: unknown | null;
  promptResponse: unknown | null;
}

export function createStoredGeneration(
  generation: Generation,
  metadata: {
    executionSnapshot?: GenerationExecutionPlan | null;
    promptRequest?: unknown | null;
    promptResponse?: unknown | null;
  } = {}
): StoredGeneration {
  return structuredClone({
    ...copyGeneration(generation),
    executionSnapshot: metadata.executionSnapshot ?? null,
    promptRequest: metadata.promptRequest ?? null,
    promptResponse: metadata.promptResponse ?? null
  });
}

export function copyStoredGeneration(generation: StoredGeneration): StoredGeneration {
  return structuredClone(generation);
}

export function toPublicGeneration(generation: StoredGeneration): Generation {
  return copyGeneration(generation);
}

export function isStoredGeneration(
  generation: Generation | StoredGeneration
): generation is StoredGeneration {
  return (
    'executionSnapshot' in generation &&
    'promptRequest' in generation &&
    'promptResponse' in generation
  );
}

function copyGeneration(generation: Generation): Generation {
  return {
    id: generation.id,
    status: generation.status,
    presetId: generation.presetId,
    templateId: generation.templateId,
    presetParams: structuredClone(generation.presetParams),
    queuedAt: generation.queuedAt,
    error: generation.error,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt
  };
}
