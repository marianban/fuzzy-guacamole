import { ofetch } from 'ofetch';

import type { PresetDetail, PresetListResponse } from '@shared/presets';

const presetsEndpoint = '/api/presets';

export function getPresets(): Promise<PresetListResponse> {
  return ofetch<PresetListResponse>(presetsEndpoint);
}

export function getPreset(id: string): Promise<PresetDetail> {
  return ofetch<PresetDetail>(`${presetsEndpoint}/${encodeURIComponent(id)}`);
}
