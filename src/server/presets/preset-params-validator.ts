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

export function validateQueuePresetParams(
  options: ValidateQueuePresetParamsOptions
): void {
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

  if (issues.length > 0) {
    throw new PresetParamsValidationError(issues);
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
    return;
  }

  if (field.fieldType === 'integer') {
    if (!Number.isInteger(value)) {
      issues.push(`Field "${field.id}" must be an integer.`);
      return;
    }
    validateNumericBounds(field, value as number, issues);
    return;
  }

  if (field.fieldType === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push(`Field "${field.id}" must be a number.`);
      return;
    }
    validateNumericBounds(field, value, issues);
    return;
  }

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
