import type { Generation } from '../../shared/generations.js';

export const EDITABLE_GENERATION_STATUSES = [
  'draft',
  'completed',
  'failed',
  'canceled'
] as const satisfies readonly Generation['status'][];

export function isEditableGenerationStatus(status: Generation['status']): boolean {
  return EDITABLE_GENERATION_STATUSES.includes(
    status as (typeof EDITABLE_GENERATION_STATUSES)[number]
  );
}
