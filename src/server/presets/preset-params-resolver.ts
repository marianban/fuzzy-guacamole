import type { PresetDetail } from '../../shared/presets.js';

export interface ResolvePresetParamsOptions {
  preset: Pick<PresetDetail, 'defaults' | 'model'>;
  userParams?: Record<string, unknown>;
  systemParams?: Record<string, unknown>;
}

export function resolvePresetParams(
  options: ResolvePresetParamsOptions
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const field of options.preset.model.fields) {
    if (field.default !== undefined) {
      resolved[field.id] = field.default;
    }
  }

  Object.assign(resolved, options.preset.defaults);

  if (options.systemParams !== undefined) {
    Object.assign(resolved, options.systemParams);
  }

  if (options.userParams !== undefined) {
    Object.assign(resolved, options.userParams);
  }

  return resolved;
}
