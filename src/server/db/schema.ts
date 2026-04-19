import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { GenerationExecutionPlan } from '../generations/execution/plan.js';

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().notNull(),
  status: text('status').notNull(),
  presetId: text('preset_id').notNull(),
  templateId: text('template_id').notNull(),
  presetParams: jsonb('preset_params').$type<Record<string, unknown>>().notNull(),
  executionSnapshot: jsonb('execution_snapshot').$type<GenerationExecutionPlan | null>(),
  promptRequest: jsonb('prompt_request').$type<unknown | null>(),
  promptResponse: jsonb('prompt_response').$type<unknown | null>(),
  queuedAt: timestamp('queued_at', {
    withTimezone: true,
    mode: 'string'
  }),
  error: text('error'),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string'
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string'
  }).notNull()
});
