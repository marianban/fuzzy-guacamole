import type { Generation } from '../../shared/generations.js';

export type GenerationProcessResult =
  | {
      status: 'completed';
    }
  | {
      status: 'failed';
      error: string;
    };

export interface GenerationProcessor {
  process(generation: Generation): Promise<GenerationProcessResult>;
}

export function createPlaceholderGenerationProcessor(): GenerationProcessor {
  return {
    async process() {
      return {
        status: 'failed',
        error: 'Generation execution is not implemented yet.'
      };
    }
  };
}
