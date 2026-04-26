import { randomUUID } from 'node:crypto';

import type { Generation } from '../../shared/generations.js';
import {
  copyStoredGeneration,
  createStoredGeneration,
  isStoredGeneration,
  toPublicGeneration,
  type StoredGeneration
} from './stored-generation.js';
import {
  assertMarkQueuedOptions,
  type CreateGenerationInput,
  type GenerationStore,
  type MarkQueuedOptions,
  type SaveableGeneration,
  type UpdateEditableGenerationInput
} from './store.js';
import { isEditableGenerationStatus } from './editable-statuses.js';

class InMemoryGenerationStore implements GenerationStore {
  readonly #byId = new Map<string, StoredGeneration>();

  async create(input: CreateGenerationInput): Promise<Generation> {
    const timestamp = new Date().toISOString();
    const generation = createStoredGeneration({
      id: randomUUID(),
      status: 'draft',
      presetId: input.presetId,
      templateId: input.templateId,
      presetParams: { ...input.presetParams },
      queuedAt: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    this.#byId.set(generation.id, copyStoredGeneration(generation));
    return toPublicGeneration(generation);
  }

  async list(): Promise<readonly Generation[]> {
    return [...this.#byId.values()]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((generation) => toPublicGeneration(copyStoredGeneration(generation)));
  }

  async getById(generationId: string): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined) {
      return undefined;
    }

    return toPublicGeneration(copyStoredGeneration(generation));
  }

  async getStoredById(generationId: string): Promise<StoredGeneration | undefined> {
    const generation = this.#byId.get(generationId);
    return generation === undefined ? undefined : copyStoredGeneration(generation);
  }

  async save(generation: SaveableGeneration): Promise<Generation> {
    const existing = this.#byId.get(generation.id);
    const storedGeneration = isStoredGeneration(generation)
      ? copyStoredGeneration(generation)
      : createStoredGeneration(generation, {
          executionSnapshot: existing?.executionSnapshot ?? null,
          promptRequest: existing?.promptRequest ?? null,
          promptResponse: existing?.promptResponse ?? null
        });
    this.#byId.set(storedGeneration.id, storedGeneration);
    return toPublicGeneration(copyStoredGeneration(storedGeneration));
  }

  async delete(generationId: string): Promise<boolean> {
    return this.#byId.delete(generationId);
  }

  async deleteDeletable(generationId: string): Promise<boolean> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined || generation.status === 'submitted') {
      return false;
    }

    return this.#byId.delete(generationId);
  }

  async setInputImagePath(
    generationId: string,
    inputImagePath: string
  ): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined) {
      return undefined;
    }

    const updatedGeneration: StoredGeneration = {
      ...generation,
      presetParams: {
        ...generation.presetParams,
        inputImagePath
      },
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(updatedGeneration.id, copyStoredGeneration(updatedGeneration));
    return toPublicGeneration(updatedGeneration);
  }

  async updateEditableGeneration(
    generationId: string,
    input: UpdateEditableGenerationInput
  ): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined || !isEditableGenerationStatus(generation.status)) {
      return undefined;
    }

    const updatedGeneration: StoredGeneration = {
      ...generation,
      presetId: input.presetId,
      templateId: input.templateId,
      presetParams: { ...input.presetParams },
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(updatedGeneration.id, copyStoredGeneration(updatedGeneration));
    return toPublicGeneration(updatedGeneration);
  }

  async markQueued(
    generationId: string,
    options: MarkQueuedOptions
  ): Promise<Generation | undefined> {
    assertMarkQueuedOptions(options);
    const generation = this.#byId.get(generationId);
    if (
      generation === undefined ||
      generation.status === 'queued' ||
      generation.status === 'submitted'
    ) {
      return undefined;
    }

    const { queuedAt, presetParams, executionSnapshot } = options;

    const updatedGeneration: StoredGeneration = {
      ...generation,
      status: 'queued',
      presetParams,
      executionSnapshot,
      promptRequest: null,
      promptResponse: null,
      queuedAt,
      updatedAt: queuedAt,
      error: null
    };
    this.#byId.set(updatedGeneration.id, copyStoredGeneration(updatedGeneration));
    return toPublicGeneration(updatedGeneration);
  }

  async claimNextQueued(): Promise<StoredGeneration | undefined> {
    const nextGeneration = [...this.#byId.values()]
      .filter((generation) => generation.status === 'queued')
      .sort(compareQueuedGenerationOrder)[0];

    if (nextGeneration === undefined) {
      return undefined;
    }

    const submittedGeneration: StoredGeneration = {
      ...nextGeneration,
      status: 'submitted',
      error: null,
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(submittedGeneration.id, copyStoredGeneration(submittedGeneration));
    return copyStoredGeneration(submittedGeneration);
  }

  async recordPromptRequest(
    generationId: string,
    promptRequest: unknown
  ): Promise<StoredGeneration | undefined> {
    return this.#updateSubmitted(generationId, (generation) => ({
      ...generation,
      promptRequest,
      updatedAt: new Date().toISOString()
    }));
  }

  async recordPromptResponse(
    generationId: string,
    promptResponse: unknown
  ): Promise<StoredGeneration | undefined> {
    return this.#updateSubmitted(generationId, (generation) => ({
      ...generation,
      promptResponse,
      updatedAt: new Date().toISOString()
    }));
  }

  async markCanceled(generationId: string): Promise<StoredGeneration | undefined> {
    const generation = this.#byId.get(generationId);
    if (
      generation === undefined ||
      (generation.status !== 'queued' && generation.status !== 'submitted')
    ) {
      return undefined;
    }

    const canceledGeneration: StoredGeneration = {
      ...generation,
      status: 'canceled',
      error: null,
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(canceledGeneration.id, copyStoredGeneration(canceledGeneration));
    return copyStoredGeneration(canceledGeneration);
  }

  async markCompleted(generationId: string): Promise<StoredGeneration | undefined> {
    return this.#updateSubmitted(generationId, (generation) => ({
      ...generation,
      status: 'completed',
      error: null,
      updatedAt: new Date().toISOString()
    }));
  }

  async markFailed(
    generationId: string,
    error: string
  ): Promise<StoredGeneration | undefined> {
    return this.#updateSubmitted(generationId, (generation) => ({
      ...generation,
      status: 'failed',
      error,
      updatedAt: new Date().toISOString()
    }));
  }

  async failSubmittedOnStartup(error: string): Promise<readonly StoredGeneration[]> {
    const failedGenerations: StoredGeneration[] = [];

    for (const generation of this.#byId.values()) {
      if (generation.status !== 'submitted') {
        continue;
      }

      const failedGeneration: StoredGeneration = {
        ...generation,
        status: 'failed',
        error,
        updatedAt: new Date().toISOString()
      };
      this.#byId.set(failedGeneration.id, copyStoredGeneration(failedGeneration));
      failedGenerations.push(copyStoredGeneration(failedGeneration));
    }

    return failedGenerations.sort(
      (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    );
  }

  async failStaleSubmittedBefore(
    staleBefore: string,
    error: string
  ): Promise<readonly StoredGeneration[]> {
    const staleBeforeMs = Date.parse(staleBefore);
    const failedGenerations: StoredGeneration[] = [];

    for (const generation of this.#byId.values()) {
      if (
        generation.status !== 'submitted' ||
        Date.parse(generation.updatedAt) > staleBeforeMs
      ) {
        continue;
      }

      const failedGeneration: StoredGeneration = {
        ...generation,
        status: 'failed',
        error,
        updatedAt: new Date().toISOString()
      };
      this.#byId.set(failedGeneration.id, copyStoredGeneration(failedGeneration));
      failedGenerations.push(copyStoredGeneration(failedGeneration));
    }

    return failedGenerations.sort(
      (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    );
  }

  async #updateSubmitted(
    generationId: string,
    update: (generation: StoredGeneration) => StoredGeneration
  ): Promise<StoredGeneration | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined || generation.status !== 'submitted') {
      return undefined;
    }

    const updatedGeneration = update(generation);
    this.#byId.set(updatedGeneration.id, copyStoredGeneration(updatedGeneration));
    return copyStoredGeneration(updatedGeneration);
  }
}

function compareQueuedGenerationOrder(
  left: StoredGeneration,
  right: StoredGeneration
): number {
  const queuedAtDifference = compareNullableTimestamp(left.queuedAt, right.queuedAt);
  if (queuedAtDifference !== 0) {
    return queuedAtDifference;
  }

  const createdAtDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

function compareNullableTimestamp(left: string | null, right: string | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return Date.parse(left) - Date.parse(right);
}

export function createInMemoryGenerationStore(): GenerationStore {
  return new InMemoryGenerationStore();
}
