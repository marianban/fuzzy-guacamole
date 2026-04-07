import { randomUUID } from 'node:crypto';

import { desc, eq, sql } from 'drizzle-orm';

import { generationStatusSchema, type Generation } from '../../shared/generations.js';
import type { AppDatabase } from '../db/client.js';
import { generations } from '../db/schema.js';
import {
  copyStoredGeneration,
  createStoredGeneration,
  isStoredGeneration,
  toPublicGeneration,
  type StoredGeneration
} from './stored-generation.js';

export interface CreateGenerationInput {
  presetId: string;
  templateId: string;
  presetParams: Record<string, unknown>;
}

type SaveableGeneration = Generation | StoredGeneration;

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
}

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

  async markQueued(
    generationId: string,
    queuedAt = new Date().toISOString()
  ): Promise<Generation | undefined> {
    const generation = this.#byId.get(generationId);
    if (
      generation === undefined ||
      generation.status === 'queued' ||
      generation.status === 'submitted'
    ) {
      return undefined;
    }

    const updatedGeneration: StoredGeneration = {
      ...generation,
      status: 'queued',
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

    const rows = await this.#database.db
      .insert(generations)
      .values(mapGenerationToInsertValues(generation))
      .returning();

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Failed to insert generation.');
    }

    return toPublicGeneration(mapRowToStoredGeneration(row));
  }

  async list(): Promise<readonly Generation[]> {
    const rows = await this.#database.db
      .select()
      .from(generations)
      .orderBy(desc(generations.createdAt));

    return rows.map((row) => toPublicGeneration(mapRowToStoredGeneration(row)));
  }

  async getById(generationId: string): Promise<Generation | undefined> {
    const generation = await this.getStoredById(generationId);
    return generation === undefined ? undefined : toPublicGeneration(generation);
  }

  async getStoredById(generationId: string): Promise<StoredGeneration | undefined> {
    const rows = await this.#database.db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId))
      .limit(1);

    const row = rows[0];
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async save(generation: SaveableGeneration): Promise<Generation> {
    const existing = !isStoredGeneration(generation)
      ? await this.getStoredById(generation.id)
      : undefined;
    const storedGeneration = isStoredGeneration(generation)
      ? generation
      : createStoredGeneration(generation, {
          promptRequest: existing?.promptRequest ?? null,
          promptResponse: existing?.promptResponse ?? null
        });

    const savedRows = await this.#database.db
      .insert(generations)
      .values(mapGenerationToInsertValues(storedGeneration))
      .onConflictDoUpdate({
        target: generations.id,
        set: {
          status: storedGeneration.status,
          presetId: storedGeneration.presetId,
          templateId: storedGeneration.templateId,
          presetParams: storedGeneration.presetParams,
          promptRequest: storedGeneration.promptRequest,
          promptResponse: storedGeneration.promptResponse,
          queuedAt: storedGeneration.queuedAt,
          error: storedGeneration.error,
          createdAt: storedGeneration.createdAt,
          updatedAt: storedGeneration.updatedAt
        }
      })
      .returning();

    const savedRow = savedRows[0];
    if (savedRow === undefined) {
      throw new Error(`Failed to save generation "${generation.id}".`);
    }

    return toPublicGeneration(mapRowToStoredGeneration(savedRow));
  }

  async delete(generationId: string): Promise<boolean> {
    const rows = await this.#database.db
      .delete(generations)
      .where(eq(generations.id, generationId))
      .returning({ id: generations.id });

    return rows.length > 0;
  }

  async deleteDeletable(generationId: string): Promise<boolean> {
    const result = await this.#database.db.execute(sql`
      delete from generations
      where id = ${generationId}
        and status in ('draft', 'queued', 'completed', 'failed', 'canceled')
      returning id
    `);

    return result.rows.length > 0;
  }

  async setInputImagePath(
    generationId: string,
    inputImagePath: string
  ): Promise<Generation | undefined> {
    const generation = await this.getStoredById(generationId);
    if (generation === undefined) {
      return undefined;
    }

    const updatedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set preset_params = ${JSON.stringify({
        ...generation.presetParams,
        inputImagePath
      })}::jsonb,
          updated_at = ${updatedAt}
      where id = ${generationId}
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
    return row === undefined
      ? undefined
      : toPublicGeneration(mapRowToStoredGeneration(row));
  }

  async markQueued(
    generationId: string,
    queuedAt = new Date().toISOString()
  ): Promise<Generation | undefined> {
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'queued',
          queued_at = ${queuedAt},
          updated_at = ${queuedAt},
          error = null
      where id = ${generationId}
        and status in ('draft', 'completed', 'failed', 'canceled')
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
    return row === undefined
      ? undefined
      : toPublicGeneration(mapRowToStoredGeneration(row));
  }

  async claimNextQueued(): Promise<StoredGeneration | undefined> {
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async recordPromptRequest(
    generationId: string,
    promptRequest: unknown
  ): Promise<StoredGeneration | undefined> {
    const recordedAt = new Date().toISOString();
    const serializedPromptRequest = serializePromptMetadata(
      'Prompt request',
      promptRequest
    );
    const result = await this.#database.db.execute(sql`
      update generations
      set prompt_request = ${serializedPromptRequest}::jsonb,
          updated_at = ${recordedAt}
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async recordPromptResponse(
    generationId: string,
    promptResponse: unknown
  ): Promise<StoredGeneration | undefined> {
    const recordedAt = new Date().toISOString();
    const serializedPromptResponse = serializePromptMetadata(
      'Prompt response',
      promptResponse
    );
    const result = await this.#database.db.execute(sql`
      update generations
      set prompt_response = ${serializedPromptResponse}::jsonb,
          updated_at = ${recordedAt}
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async markCanceled(generationId: string): Promise<StoredGeneration | undefined> {
    const canceledAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'canceled',
          updated_at = ${canceledAt},
          error = null
      where id = ${generationId}
        and status in ('queued', 'submitted')
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async markCompleted(generationId: string): Promise<StoredGeneration | undefined> {
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async markFailed(
    generationId: string,
    error: string
  ): Promise<StoredGeneration | undefined> {
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
    return row === undefined ? undefined : mapRowToStoredGeneration(row);
  }

  async failSubmittedOnStartup(error: string): Promise<readonly StoredGeneration[]> {
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
      mapRowToStoredGeneration(row as typeof generations.$inferSelect)
    );
  }
}

export function createPostgresGenerationStore(database: AppDatabase): GenerationStore {
  return new PostgresGenerationStore(database);
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

function mapRowToStoredGeneration(
  row: typeof generations.$inferSelect
): StoredGeneration {
  return createStoredGeneration(
    {
      id: row.id,
      status: generationStatusSchema.parse(row.status),
      presetId: row.presetId,
      templateId: row.templateId,
      presetParams: { ...row.presetParams },
      queuedAt: normalizeNullableTimestamp(row.queuedAt),
      error: row.error,
      createdAt: normalizeTimestamp(row.createdAt),
      updatedAt: normalizeTimestamp(row.updatedAt)
    },
    {
      promptRequest: row.promptRequest,
      promptResponse: row.promptResponse
    }
  );
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

function mapGenerationToInsertValues(generation: StoredGeneration) {
  return {
    id: generation.id,
    status: generation.status,
    presetId: generation.presetId,
    templateId: generation.templateId,
    presetParams: generation.presetParams,
    promptRequest: generation.promptRequest,
    promptResponse: generation.promptResponse,
    queuedAt: generation.queuedAt,
    error: generation.error,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt
  };
}

function serializePromptMetadata(label: string, value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new TypeError(
      `${label} metadata must be JSON-serializable. ${normalizeErrorMessage(error)}`
    );
  }
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
