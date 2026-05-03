import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import type { PresetDetail, PresetModelField } from '../../shared/presets.js';

export class PresetParamsValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? 'Preset parameter validation failed.');
    this.name = 'PresetParamsValidationError';
    this.issues = issues;
  }
}

interface ValidateCreatePresetParamsOptions {
  preset: Pick<PresetDetail, 'model'>;
  rawParams: Record<string, unknown>;
  resolvedParams: Record<string, unknown>;
}

interface ValidateQueuePresetParamsOptions {
  preset: Pick<PresetDetail, 'model' | 'template'>;
  resolvedParams: Record<string, unknown>;
}

export function validateCreatePresetParams(
  options: ValidateCreatePresetParamsOptions
): void {
  const issues: string[] = [];
  const modelFieldIds = new Set(options.preset.model.fields.map((field) => field.id));

  for (const key of Object.keys(options.rawParams)) {
    if (!modelFieldIds.has(key)) {
      issues.push(`Preset parameter "${key}" is not defined in model.json.`);
    }
  }

  validateModelFieldValues(options.preset.model.fields, options.resolvedParams, issues);

  if (issues.length > 0) {
    throw new PresetParamsValidationError(issues);
  }
}

export async function validateQueuePresetParams(
  options: ValidateQueuePresetParamsOptions
): Promise<void> {
  const issues: string[] = [];
  const modelFieldsById = new Map(
    options.preset.model.fields.map((field) => [field.id, field])
  );
  const runtimeParamKeys = new Set(options.preset.template.implicitRuntimeParamKeys);

  for (const token of extractWorkflowTemplateTokens(options.preset.template.workflow)) {
    const field = modelFieldsById.get(token);
    if (field !== undefined) {
      continue;
    }

    if (!runtimeParamKeys.has(token)) {
      issues.push(
        `Workflow token "{{${token}}}" does not reference a model field or available runtime parameter.`
      );
      continue;
    }

    if (!hasResolvedValue(options.resolvedParams[token])) {
      issues.push(`Runtime parameter "${token}" is required before queueing.`);
    }
  }

  validateModelFieldValues(options.preset.model.fields, options.resolvedParams, issues);
  await validateRuntimeFileInputs(options, issues);

  if (issues.length > 0) {
    throw new PresetParamsValidationError(issues);
  }
}

async function validateRuntimeFileInputs(
  options: ValidateQueuePresetParamsOptions,
  issues: string[]
): Promise<void> {
  if (!options.preset.template.implicitRuntimeParamKeys.includes('inputImagePath')) {
    return;
  }

  const inputImagePath = options.resolvedParams.inputImagePath;
  if (!hasResolvedValue(inputImagePath)) {
    return;
  }

  if (typeof inputImagePath !== 'string') {
    issues.push(
      'Runtime parameter "inputImagePath" must reference an existing readable file before queueing.'
    );
    return;
  }

  try {
    await access(inputImagePath, constants.R_OK);
    const inputStats = await stat(inputImagePath);
    if (!inputStats.isFile()) {
      issues.push(
        'Runtime parameter "inputImagePath" must reference an existing readable file before queueing.'
      );
    }
  } catch {
    issues.push(
      'Runtime parameter "inputImagePath" must reference an existing readable file before queueing.'
    );
  }
}

function validateModelFieldValues(
  fields: PresetDetail['model']['fields'],
  resolvedParams: Record<string, unknown>,
  issues: string[]
): void {
  for (const field of fields) {
    if (!isFieldActive(field, resolvedParams)) {
      continue;
    }

    const value = resolvedParams[field.id];
    if (!hasResolvedValue(value)) {
      if (field.validation.required) {
        issues.push(`Field "${field.id}" is required.`);
      }
      continue;
    }

    validateFieldValue(field, value, issues);
  }
}

function validateFieldValue(
  field: PresetModelField,
  value: unknown,
  issues: string[]
): void {
  if (field.fieldType === 'string') {
    validateStringField(field, value, issues);
    return;
  }

  if (field.fieldType === 'integer') {
    validateIntegerField(field, value, issues);
    return;
  }

  if (field.fieldType === 'number') {
    validateNumberField(field, value, issues);
    return;
  }

  if (field.fieldType === 'enum') {
    validateEnumField(field, value, issues);
    return;
  }

  throw new Error(
    `Field "${field.id}" has unsupported fieldType "${String(field.fieldType)}".`
  );
}

function validateStringField(
  field: PresetModelField,
  value: unknown,
  issues: string[]
): void {
  if (typeof value !== 'string') {
    issues.push(`Field "${field.id}" must be a string.`);
    return;
  }

  if (
    field.validation.minLength !== undefined &&
    value.length < field.validation.minLength
  ) {
    issues.push(
      `Field "${field.id}" must be at least ${field.validation.minLength} characters long.`
    );
  }

  if (
    field.validation.maxLength !== undefined &&
    value.length > field.validation.maxLength
  ) {
    issues.push(
      `Field "${field.id}" must be at most ${field.validation.maxLength} characters long.`
    );
  }

  if (
    field.validation.pattern !== undefined &&
    !new RegExp(field.validation.pattern).test(value)
  ) {
    issues.push(`Field "${field.id}" does not match the required pattern.`);
  }
}

function validateIntegerField(
  field: PresetModelField,
  value: unknown,
  issues: string[]
): void {
  if (!Number.isInteger(value)) {
    issues.push(`Field "${field.id}" must be an integer.`);
    return;
  }

  validateNumericBounds(field, value as number, issues);
}

function validateNumberField(
  field: PresetModelField,
  value: unknown,
  issues: string[]
): void {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    issues.push(`Field "${field.id}" must be a number.`);
    return;
  }

  validateNumericBounds(field, value, issues);
}

function validateEnumField(
  field: PresetModelField,
  value: unknown,
  issues: string[]
): void {
  if (typeof value !== 'string') {
    issues.push(`Field "${field.id}" must be one of the configured enum values.`);
    return;
  }

  if (field.control.type !== 'select') {
    issues.push(
      `Field "${field.id}" is misconfigured because enum fields must use select control.`
    );
    return;
  }

  if (!field.control.options.some((option) => option.value === value)) {
    issues.push(`Field "${field.id}" must be one of the configured enum values.`);
  }
}

function validateNumericBounds(
  field: PresetModelField,
  value: number,
  issues: string[]
): void {
  if (field.validation.min !== undefined && value < field.validation.min) {
    issues.push(`Field "${field.id}" must be at least ${field.validation.min}.`);
  }
  if (field.validation.max !== undefined && value > field.validation.max) {
    issues.push(`Field "${field.id}" must be at most ${field.validation.max}.`);
  }
}

function isFieldActive(
  field: PresetModelField,
  resolvedParams: Record<string, unknown>
): boolean {
  if (field.visibility === undefined) {
    return true;
  }

  return resolvedParams[field.visibility.field] === field.visibility.equals;
}

function hasResolvedValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
}

function extractWorkflowTemplateTokens(workflow: Record<string, unknown>): Set<string> {
  const tokens = new Set<string>();

  visitValue(workflow, tokens);

  return tokens;
}

function visitValue(value: unknown, tokens: Set<string>): void {
  if (typeof value === 'string') {
    for (const token of value.matchAll(/\{\{([^{}]+)\}\}/g)) {
      const tokenId = token[1]?.trim();
      if (tokenId !== undefined && tokenId.length > 0) {
        tokens.add(tokenId);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      visitValue(item, tokens);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const nestedValue of Object.values(value)) {
      visitValue(nestedValue, tokens);
    }
  }
}
