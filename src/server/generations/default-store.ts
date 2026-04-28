import { createInMemoryGenerationStore } from './in-memory-store.js';
import type { GenerationStore } from './store.js';

export function createGenerationStore(): GenerationStore {
  return createInMemoryGenerationStore();
}
