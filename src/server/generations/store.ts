import { randomUUID } from 'node:crypto';

import { desc, eq, sql } from 'drizzle-orm';

import { generationStatusSchema, type Generation } from '../../shared/generations.js';
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
  claimNextQueued(): Promise<Generation | undefined>;
  markCompleted(generationId: string): Promise<Generation | undefined>;
  markFailed(generationId: string, error: string): Promise<Generation | undefined>;
  failSubmittedOnStartup(error: string): Promise<readonly Generation[]>;
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
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
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

  async claimNextQueued(): Promise<Generation | undefined> {
    const nextGeneration = [...this.#byId.values()]
      .filter((generation) => generation.status === 'queued')
      .sort(compareQueuedGenerationOrder)[0];

    if (nextGeneration === undefined) {
      return undefined;
    }

    const submittedGeneration: Generation = {
      ...nextGeneration,
      status: 'submitted',
      error: null,
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(submittedGeneration.id, copyGeneration(submittedGeneration));
    return copyGeneration(submittedGeneration);
  }

  async markCompleted(generationId: string): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined || generation.status !== 'submitted') {
      return undefined;
    }

    const completedGeneration: Generation = {
      ...generation,
      status: 'completed',
      error: null,
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(completedGeneration.id, copyGeneration(completedGeneration));
    return copyGeneration(completedGeneration);
  }

  async markFailed(generationId: string, error: string): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (generation === undefined || generation.status !== 'submitted') {
      return undefined;
    }

    const failedGeneration: Generation = {
      ...generation,
      status: 'failed',
      error,
      updatedAt: new Date().toISOString()
    };
    this.#byId.set(failedGeneration.id, copyGeneration(failedGeneration));
    return copyGeneration(failedGeneration);
  }

  async failSubmittedOnStartup(error: string): Promise<readonly Generation[]> {
    const failedGenerations: Generation[] = [];

    for (const generation of this.#byId.values()) {
      if (generation.status !== 'submitted') {
        continue;
      }

      const failedGeneration: Generation = {
        ...generation,
        status: 'failed',
        error,
        updatedAt: new Date().toISOString()
      };
      this.#byId.set(failedGeneration.id, copyGeneration(failedGeneration));
      failedGenerations.push(copyGeneration(failedGeneration));
    }

    return failedGenerations.sort(
      (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    );
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

  async claimNextQueued(): Promise<Generation | undefined> {
    const claimedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      with next_generation as (
        select id
        from generations
        where status = 'queued'
        order by queued_at asc nulls last, created_at asc, id asc
        limit 1
        for update skip locked
      )
      update generations
      set status = 'submitted',
          updated_at = ${claimedAt},
          error = null
      from next_generation
      where generations.id = next_generation.id
      returning generations.id,
                generations.status,
                generations.preset_id as "presetId",
                generations.template_id as "templateId",
                generations.preset_params as "presetParams",
                generations.prompt_request as "promptRequest",
                generations.prompt_response as "promptResponse",
                generations.queued_at as "queuedAt",
                generations.error,
                generations.created_at as "createdAt",
                generations.updated_at as "updatedAt"
    `);

    const row = result.rows[0] as typeof generations.$inferSelect | undefined;
    return row === undefined ? undefined : mapRowToGeneration(row);
  }

  async markCompleted(generationId: string): Promise<Generation | undefined> {
    const completedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'completed',
          updated_at = ${completedAt},
          error = null
      where id = ${generationId}
        and status = 'submitted'
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                prompt_request as "promptRequest",
                prompt_response as "promptResponse",
                queued_at as "queuedAt",
                error,
                created_at as "createdAt",
                updated_at as "updatedAt"
    `);

    const row = result.rows[0] as typeof generations.$inferSelect | undefined;
    return row === undefined ? undefined : mapRowToGeneration(row);
  }

  async markFailed(generationId: string, error: string): Promise<Generation | undefined> {
    const failedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'failed',
          updated_at = ${failedAt},
          error = ${error}
      where id = ${generationId}
        and status = 'submitted'
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                prompt_request as "promptRequest",
                prompt_response as "promptResponse",
                queued_at as "queuedAt",
                error,
                created_at as "createdAt",
                updated_at as "updatedAt"
    `);

    const row = result.rows[0] as typeof generations.$inferSelect | undefined;
    return row === undefined ? undefined : mapRowToGeneration(row);
  }

  async failSubmittedOnStartup(error: string): Promise<readonly Generation[]> {
    const failedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'failed',
          updated_at = ${failedAt},
          error = ${error}
      where status = 'submitted'
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                prompt_request as "promptRequest",
                prompt_response as "promptResponse",
                queued_at as "queuedAt",
                error,
                created_at as "createdAt",
                updated_at as "updatedAt"
    `);

    return result.rows.map((row) =>
      mapRowToGeneration(row as typeof generations.$inferSelect)
    );
  }
}

export function createPostgresGenerationStore(database: AppDatabase): GenerationStore {
  return new PostgresGenerationStore(database);
}

function copyGeneration(generation: Generation): Generation {
  return {
    ...generation,
    presetParams: { ...generation.presetParams }
  };
}

function compareQueuedGenerationOrder(left: Generation, right: Generation): number {
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

function mapRowToGeneration(row: typeof generations.$inferSelect): Generation {
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
