import { EventEmitter } from 'node:events';

import type { GenerationEvent } from '../../shared/generations.js';

export interface GenerationEventBus {
  publish(event: GenerationEvent): void;
  subscribe(listener: (event: GenerationEvent) => void): () => void;
}

class InMemoryGenerationEventBus implements GenerationEventBus {
  readonly #emitter = new EventEmitter();
  readonly #eventName = 'generation:event';

  publish(event: GenerationEvent): void {
    this.#emitter.emit(this.#eventName, event);
  }

  subscribe(listener: (event: GenerationEvent) => void): () => void {
    this.#emitter.on(this.#eventName, listener);
    return () => {
      this.#emitter.off(this.#eventName, listener);
    };
  }
}

export function createGenerationEventBus(): GenerationEventBus {
  return new InMemoryGenerationEventBus();
}
