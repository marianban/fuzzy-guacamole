import type { AppConfig } from '../../../config/app-config.js';
import type { GenerationEventBus } from '../../../generations/events.js';
import type { GenerationStore } from '../../../generations/store.js';
import type { PresetCatalog } from '../../../presets/preset-catalog.js';

export interface RegisterGenerationRoutesOptions {
  config: AppConfig | undefined;
  presetCatalog: PresetCatalog;
  store: GenerationStore;
  eventBus: GenerationEventBus;
}
