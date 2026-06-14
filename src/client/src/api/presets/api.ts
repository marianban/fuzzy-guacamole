import { ofetch } from 'ofetch';

import type { PresetDetail, PresetSummary } from '@shared/presets';

const presetsEndpoint = '/api/presets';

export function getPresets(): Promise<PresetSummary[]> {
  return ofetch<PresetSummary[]>(presetsEndpoint);
}

export function getPreset(id: string): Promise<PresetDetail> {
  return ofetch<PresetDetail>(`${presetsEndpoint}/${encodeURIComponent(id)}`);
}
