import { randomUUID } from 'node:crypto';

import type { Generation } from '../../shared/generations.js';

export interface CreateGenerationInput {
  presetId: string;
  templateId: string;
  presetParams: Record<string, unknown>;
}

export interface GenerationStore {
  create(input: CreateGenerationInput): Generation;
  list(): readonly Generation[];
  getById(generationId: string): Generation | undefined;
  save(generation: Generation): Generation;
  delete(generationId: string): boolean;
}

class InMemoryGenerationStore implements GenerationStore {
  readonly #byId = new Map<string, Generation>();

  create(input: CreateGenerationInput): Generation {
    const timestamp = new Date().toISOString();
    const generation: Generation = {
      id: randomUUID(),
      status: 'draft',
      presetId: input.presetId,
      templateId: input.templateId,
      presetParams: { ...input.presetParams },
      queuedAt: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.#byId.set(generation.id, generation);
    return copyGeneration(generation);
  }

  list(): readonly Generation[] {
    return [...this.#byId.values()]
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      )
      .map(copyGeneration);
  }

  getById(generationId: string): Generation | undefined {
    const generation = this.#byId.get(generationId);
    if (generation === undefined) {
      return undefined;
    }

    return copyGeneration(generation);
  }

  save(generation: Generation): Generation {
    this.#byId.set(generation.id, copyGeneration(generation));
    return copyGeneration(generation);
  }

  delete(generationId: string): boolean {
    return this.#byId.delete(generationId);
  }
}

export function createGenerationStore(): GenerationStore {
  return new InMemoryGenerationStore();
}

function copyGeneration(generation: Generation): Generation {
  return {
    ...generation,
    presetParams: { ...generation.presetParams }
  };
}
