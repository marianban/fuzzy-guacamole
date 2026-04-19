import type { PresetDetail } from '../../../shared/presets.js';
import {
  PresetParamsValidationError,
  validateQueuePresetParams
} from '../../presets/preset-params-validator.js';
import { resolvePresetParams } from '../../presets/preset-params-resolver.js';
import {
  type GenerationExecutionPlan
} from './plan.js';

export class GenerationExecutionValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? 'Generation execution validation failed.');
    this.name = 'GenerationExecutionValidationError';
    this.issues = issues;
  }
}

export interface BuildGenerationExecutionOptions {
  generation: {
    id: string;
    presetId: string;
    templateId: string;
    presetParams: Record<string, unknown>;
  };
  preset: PresetDetail;
  randomSeed?: () => number;
}

export async function buildGenerationExecution(
  options: BuildGenerationExecutionOptions
): Promise<GenerationExecutionPlan> {
  const optionalFieldTokenIds = new Set(
    options.preset.model.fields
      .filter((field) => field.validation.required === false)
      .map((field) => field.id)
  );
  const { userParams, systemParams } = splitGenerationParams(
    options.preset,
    options.generation.presetParams
  );
  const resolvedParams = resolvePresetParams({
    preset: options.preset,
    userParams,
    systemParams
  });

  normalizeSeedParams(resolvedParams, options.randomSeed ?? generateRandomSeed);

  try {
    await validateQueuePresetParams({
      preset: options.preset,
      resolvedParams
    });
  } catch (error) {
    if (error instanceof PresetParamsValidationError) {
      throw new GenerationExecutionValidationError(error.issues);
    }
    throw error;
  }

  const issues: string[] = [];
  const workflow = materializeValue(
    structuredClone(options.preset.template.workflow),
    resolvedParams,
    issues,
    optionalFieldTokenIds
  );

  if (issues.length > 0) {
    throw new GenerationExecutionValidationError(dedupeIssues(issues));
  }

  if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) {
    throw new GenerationExecutionValidationError([
      'Template workflow must materialize to an object.'
    ]);
  }

  const inputImagePath =
    typeof resolvedParams.inputImagePath === 'string' &&
    resolvedParams.inputImagePath.length > 0
      ? resolvedParams.inputImagePath
      : undefined;
  const preferredOutputNodeId = findPreferredOutputNodeId(
    workflow as Record<string, unknown>
  );

  return {
    workflow: workflow as Record<string, unknown>,
    resolvedParams,
    ...(inputImagePath !== undefined ? { inputImagePath } : {}),
    ...(preferredOutputNodeId !== undefined ? { preferredOutputNodeId } : {})
  };
}

const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;
const FULL_TOKEN_PATTERN = /^\{\{([^{}]+)\}\}$/;
const MAX_SEED = Number.MAX_SAFE_INTEGER;

function splitGenerationParams(
  preset: Pick<PresetDetail, 'model'>,
  presetParams: Record<string, unknown>
): {
  userParams: Record<string, unknown>;
  systemParams: Record<string, unknown>;
} {
  const modelFieldIds = new Set(preset.model.fields.map((field) => field.id));
  const userParams: Record<string, unknown> = {};
  const systemParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(presetParams)) {
    if (modelFieldIds.has(key)) {
      userParams[key] = value;
    } else {
      systemParams[key] = value;
    }
  }

  return {
    userParams,
    systemParams
  };
}

function normalizeSeedParams(
  resolvedParams: Record<string, unknown>,
  randomSeed: () => number
): void {
  if (resolvedParams.seedMode !== 'random') {
    return;
  }

  const seed = randomSeed();
  resolvedParams.seed = Number.isInteger(seed) ? seed : Math.floor(seed);
}

function generateRandomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

function materializeValue(
  value: unknown,
  resolvedParams: Record<string, unknown>,
  issues: string[],
  optionalFieldTokenIds: ReadonlySet<string>
): unknown {
  if (typeof value === 'string') {
    return materializeString(value, resolvedParams, issues, optionalFieldTokenIds);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      materializeValue(item, resolvedParams, issues, optionalFieldTokenIds)
    );
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        materializeValue(nestedValue, resolvedParams, issues, optionalFieldTokenIds)
      ])
    );
  }

  return value;
}

function materializeString(
  value: string,
  resolvedParams: Record<string, unknown>,
  issues: string[],
  optionalFieldTokenIds: ReadonlySet<string>
): unknown {
  const fullMatch = value.match(FULL_TOKEN_PATTERN);
  if (fullMatch?.[1] !== undefined) {
    const token = fullMatch[1].trim();
    const resolvedValue = resolvedParams[token];
    if (!canMaterializeTokenValue(token, resolvedValue, optionalFieldTokenIds)) {
      issues.push(`Runtime parameter "${token}" is required before execution.`);
      return value;
    }

    return normalizeFullTokenValue(token, resolvedValue, optionalFieldTokenIds);
  }

  if (!value.includes('{{')) {
    return value;
  }

  return value.replace(TOKEN_PATTERN, (_, rawToken: string) => {
    const token = rawToken.trim();
    const resolvedValue = resolvedParams[token];
    if (!canMaterializeTokenValue(token, resolvedValue, optionalFieldTokenIds)) {
      issues.push(`Runtime parameter "${token}" is required before execution.`);
      return `{{${token}}}`;
    }

    return normalizeEmbeddedTokenValue(token, resolvedValue, optionalFieldTokenIds);
  });
}

function canMaterializeTokenValue(
  token: string,
  value: unknown,
  optionalFieldTokenIds: ReadonlySet<string>
): boolean {
  if (isMissingOptionalFieldToken(token, value, optionalFieldTokenIds)) {
    return true;
  }

  return hasResolvedValue(value);
}

function normalizeFullTokenValue(
  token: string,
  value: unknown,
  optionalFieldTokenIds: ReadonlySet<string>
): unknown {
  if (isMissingOptionalFieldToken(token, value, optionalFieldTokenIds)) {
    return null;
  }

  return value;
}

function normalizeEmbeddedTokenValue(
  token: string,
  value: unknown,
  optionalFieldTokenIds: ReadonlySet<string>
): string {
  if (isMissingOptionalFieldToken(token, value, optionalFieldTokenIds)) {
    return '';
  }

  return String(value);
}

function isMissingOptionalFieldToken(
  token: string,
  value: unknown,
  optionalFieldTokenIds: ReadonlySet<string>
): boolean {
  return optionalFieldTokenIds.has(token) && !hasResolvedValue(value);
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

function findPreferredOutputNodeId(
  workflow: Record<string, unknown>
): string | undefined {
  return Object.entries(workflow)
    .filter(([, value]) => isWorkflowClassType(value, 'SaveImage'))
    .map(([nodeId]) => nodeId)
    .sort(compareNodeIds)[0];
}

function isWorkflowClassType(value: unknown, classType: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'class_type' in value &&
    value.class_type === classType
  );
}

function compareNodeIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function dedupeIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}
