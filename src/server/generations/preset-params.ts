import type { PresetDetail } from '../../shared/presets.js';

export function pickNonModelPresetParams(
  presetParams: Record<string, unknown>,
  preset: Pick<PresetDetail, 'model'>
): Record<string, unknown> {
  const modelFieldIds = new Set(preset.model.fields.map((field) => field.id));
  return Object.fromEntries(
    Object.entries(presetParams).filter(([key]) => !modelFieldIds.has(key))
  );
}
