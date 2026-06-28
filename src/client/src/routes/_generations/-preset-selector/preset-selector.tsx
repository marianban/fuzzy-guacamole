import { SlidersHorizontal } from 'lucide-react';

import styles from './preset-selector.module.css';

interface PresetSelectorProps {
  label?: string;
  presetId: string;
}

const PRESET_DISPLAY_NAME = 'Cinematic Exterior';

export function PresetSelector({
  label = 'Preset Selector',
  presetId
}: PresetSelectorProps) {
  return (
    <button
      aria-label={label}
      className={styles.root}
      data-preset-id={presetId}
      type="button"
    >
      <span className={styles.value}>{PRESET_DISPLAY_NAME}</span>
      <SlidersHorizontal aria-hidden="true" className={styles.icon} />
    </button>
  );
}
