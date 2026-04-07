import type { Generation } from '../../shared/generations.js';
import type { AppDatabase } from '../db/client.js';
import { createInMemoryGenerationStore } from './in-memory-store.js';
import { createPostgresGenerationStore as createPostgresGenerationStoreImpl } from './postgres-store.js';
import type { StoredGeneration } from './stored-generation.js';

export interface CreateGenerationInput {
  presetId: string;
  templateId: string;
  presetParams: Record<string, unknown>;
}

export type SaveableGeneration = Generation | StoredGeneration;

export interface GenerationStore {
  create(input: CreateGenerationInput): Promise<Generation>;
  list(): Promise<readonly Generation[]>;
  getById(generationId: string): Promise<Generation | undefined>;
  getStoredById(generationId: string): Promise<StoredGeneration | undefined>;
  save(generation: SaveableGeneration): Promise<Generation>;
  delete(generationId: string): Promise<boolean>;
  deleteDeletable(generationId: string): Promise<boolean>;
  setInputImagePath(
    generationId: string,
    inputImagePath: string
  ): Promise<Generation | undefined>;
  markQueued(generationId: string, queuedAt?: string): Promise<Generation | undefined>;
  claimNextQueued(): Promise<StoredGeneration | undefined>;
  recordPromptRequest(
    generationId: string,
    promptRequest: unknown
  ): Promise<StoredGeneration | undefined>;
  recordPromptResponse(
    generationId: string,
    promptResponse: unknown
  ): Promise<StoredGeneration | undefined>;
  markCanceled(generationId: string): Promise<StoredGeneration | undefined>;
  markCompleted(generationId: string): Promise<StoredGeneration | undefined>;
  markFailed(generationId: string, error: string): Promise<StoredGeneration | undefined>;
  failSubmittedOnStartup(error: string): Promise<readonly StoredGeneration[]>;
  failStaleSubmittedBefore(
    staleBefore: string,
    error: string
  ): Promise<readonly StoredGeneration[]>;
}

export function createGenerationStore(): GenerationStore {
  return createInMemoryGenerationStore();
}
export function createPostgresGenerationStore(database: AppDatabase): GenerationStore {
  return createPostgresGenerationStoreImpl(database);
}
