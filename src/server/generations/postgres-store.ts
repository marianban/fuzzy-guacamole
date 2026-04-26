import { randomUUID } from 'node:crypto';

import { desc, eq, sql } from 'drizzle-orm';

import { generationStatusSchema, type Generation } from '../../shared/generations.js';
import type { AppDatabase } from '../db/client.js';
import { generations } from '../db/schema.js';
import type { GenerationExecutionPlan } from './execution/plan.js';
import {
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
import { EDITABLE_GENERATION_STATUSES } from './editable-statuses.js';

const editableGenerationStatusesSql = sql.join(
  EDITABLE_GENERATION_STATUSES.map((status) => sql`${status}`),
  sql`, `
);

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
          executionSnapshot: existing?.executionSnapshot ?? null,
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
          executionSnapshot: storedGeneration.executionSnapshot,
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
                execution_snapshot as "executionSnapshot",
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

  async updateEditableGeneration(
    generationId: string,
    input: UpdateEditableGenerationInput
  ): Promise<Generation | undefined> {
    const updatedAt = new Date().toISOString();
    const serializedPresetParams = JSON.stringify(input.presetParams);
    const result = await this.#database.db.execute(sql`
      update generations
      set preset_id = ${input.presetId},
          template_id = ${input.templateId},
          preset_params = ${serializedPresetParams}::jsonb,
          updated_at = ${updatedAt}
      where id = ${generationId}
        and status in (${editableGenerationStatusesSql})
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                execution_snapshot as "executionSnapshot",
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
    options: MarkQueuedOptions
  ): Promise<Generation | undefined> {
    assertMarkQueuedOptions(options);
    const { queuedAt, presetParams, executionSnapshot } = options;
    const serializedPresetParams = JSON.stringify(presetParams);
    const serializedExecutionSnapshot = JSON.stringify(executionSnapshot);
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'queued',
          preset_params = ${serializedPresetParams}::jsonb,
          execution_snapshot = ${serializedExecutionSnapshot}::jsonb,
          prompt_request = null,
          prompt_response = null,
          queued_at = ${queuedAt},
          updated_at = ${queuedAt},
          error = null
      where id = ${generationId}
        and status in (${editableGenerationStatusesSql})
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                execution_snapshot as "executionSnapshot",
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
                generations.execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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
                execution_snapshot as "executionSnapshot",
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

  async failStaleSubmittedBefore(
    staleBefore: string,
    error: string
  ): Promise<readonly StoredGeneration[]> {
    const failedAt = new Date().toISOString();
    const result = await this.#database.db.execute(sql`
      update generations
      set status = 'failed',
          updated_at = ${failedAt},
          error = ${error}
      where status = 'submitted'
        and updated_at <= ${staleBefore}
      returning id,
                status,
                preset_id as "presetId",
                template_id as "templateId",
                preset_params as "presetParams",
                execution_snapshot as "executionSnapshot",
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
      executionSnapshot: row.executionSnapshot as GenerationExecutionPlan | null,
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
    executionSnapshot: generation.executionSnapshot,
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

export function createPostgresGenerationStore(database: AppDatabase): GenerationStore {
  return new PostgresGenerationStore(database);
}
