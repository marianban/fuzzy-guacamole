import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import {
  generationStatusSchema,
  type Generation
} from '../../shared/generations.js';
import type { AppDatabase } from '../db/client.js';
import { generations } from '../db/schema.js';

export interface CreateGenerationInput {
  presetId: string;
  templateId: string;
  presetParams: Record<string, unknown>;
}

export interface GenerationStore {
  create(input: CreateGenerationInput): Promise<Generation>;
  list(): Promise<readonly Generation[]>;
  getById(generationId: string): Promise<Generation | undefined>;
  save(generation: Generation): Promise<Generation>;
  delete(generationId: string): Promise<boolean>;
}

class InMemoryGenerationStore implements GenerationStore {
  readonly #byId = new Map<string, Generation>();

  async create(input: CreateGenerationInput): Promise<Generation> {
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

  async list(): Promise<readonly Generation[]> {
    return [...this.#byId.values()]
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      )
      .map(copyGeneration);
  }

  async getById(generationId: string): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined) {
      return undefined;
    }

    return copyGeneration(generation);
  }

  async save(generation: Generation): Promise<Generation> {
    this.#byId.set(generation.id, copyGeneration(generation));
    return copyGeneration(generation);
  }

  async delete(generationId: string): Promise<boolean> {
    return this.#byId.delete(generationId);
  }
}

export function createGenerationStore(): GenerationStore {
  return new InMemoryGenerationStore();
}

class PostgresGenerationStore implements GenerationStore {
  readonly #database: AppDatabase;

  constructor(database: AppDatabase) {
    this.#database = database;
  }

  async create(input: CreateGenerationInput): Promise<Generation> {
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

    const rows = await this.#database.db
      .insert(generations)
      .values(mapGenerationToInsertValues(generation))
      .returning();

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Failed to insert generation.');
    }

    return mapRowToGeneration(row);
  }

  async list(): Promise<readonly Generation[]> {
    const rows = await this.#database.db
      .select()
      .from(generations)
      .orderBy(desc(generations.createdAt));

    return rows.map(mapRowToGeneration);
  }

  async getById(generationId: string): Promise<Generation | undefined> {
    const rows = await this.#database.db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId))
      .limit(1);

    const row = rows[0];
    return row === undefined ? undefined : mapRowToGeneration(row);
  }

  async save(generation: Generation): Promise<Generation> {
    const savedRows = await this.#database.db
      .insert(generations)
      .values(mapGenerationToInsertValues(generation))
      .onConflictDoUpdate({
        target: generations.id,
        set: {
          status: generation.status,
          presetId: generation.presetId,
          templateId: generation.templateId,
          presetParams: generation.presetParams,
          queuedAt: generation.queuedAt,
          error: generation.error,
          createdAt: generation.createdAt,
          updatedAt: generation.updatedAt
        }
      })
      .returning();

    const savedRow = savedRows[0];
    if (savedRow === undefined) {
      throw new Error(`Failed to save generation "${generation.id}".`);
    }

    return mapRowToGeneration(savedRow);
  }

  async delete(generationId: string): Promise<boolean> {
    const rows = await this.#database.db
      .delete(generations)
      .where(eq(generations.id, generationId))
      .returning({ id: generations.id });

    return rows.length > 0;
  }
}

export function createPostgresGenerationStore(
  database: AppDatabase
): GenerationStore {
  return new PostgresGenerationStore(database);
}

function copyGeneration(generation: Generation): Generation {
  return {
    ...generation,
    presetParams: { ...generation.presetParams }
  };
}

function mapRowToGeneration(
  row: typeof generations.$inferSelect
): Generation {
  return {
    id: row.id,
    status: generationStatusSchema.parse(row.status),
    presetId: row.presetId,
    templateId: row.templateId,
    presetParams: { ...row.presetParams },
    queuedAt: normalizeNullableTimestamp(row.queuedAt),
    error: row.error,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt)
  };
}

function normalizeTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function normalizeNullableTimestamp(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

function mapGenerationToInsertValues(generation: Generation) {
  return {
    id: generation.id,
    status: generation.status,
    presetId: generation.presetId,
    templateId: generation.templateId,
    presetParams: generation.presetParams,
    promptRequest: null,
    promptResponse: null,
    queuedAt: generation.queuedAt,
    error: generation.error,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt
  };
}
