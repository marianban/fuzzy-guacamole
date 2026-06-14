import { useQuery } from '@tanstack/react-query';

import { getPreset, getPresets } from './api';

export const presetKeys = {
  all: ['presets'] as const,
  lists: () => [...presetKeys.all, 'list'] as const,
  list: () => [...presetKeys.lists()] as const,
  details: () => [...presetKeys.all, 'detail'] as const,
  detail: (id: string) => [...presetKeys.details(), id] as const
};

export function usePresets() {
  return useQuery({
    queryKey: presetKeys.list(),
    queryFn: getPresets
  });
}

export function usePreset(id: string) {
  return useQuery({
    queryKey: presetKeys.detail(id),
    queryFn: () => getPreset(id)
  });
}
