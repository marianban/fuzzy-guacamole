import { randomUUID } from 'node:crypto';

import type {
  GenerationTelemetrySource,
  GenerationTelemetryStep
} from '../../shared/generation-telemetry.js';
import type { GenerationEvent, GenerationStatus } from '../../shared/generations.js';
import type { GenerationEventBus } from './events.js';

type GenerationTelemetryPayload = Extract<
  GenerationEvent,
  { type: 'telemetry' }
>['telemetry'];

interface TelemetryContext {
  runId: string;
  sequence: number;
}

export interface GenerationTelemetryOptions {
  eventBus: GenerationEventBus;
  now: () => Date;
}

export interface PublishTelemetryOptions {
  generationId: string;
  occurredAt?: string | undefined;
}

export interface PublishMilestoneOptions extends PublishTelemetryOptions {
  source: GenerationTelemetrySource;
  status?: GenerationStatus | undefined;
  step?: GenerationTelemetryStep | undefined;
  message?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface PublishProgressOptions extends PublishTelemetryOptions {
  source: GenerationTelemetrySource;
  step: GenerationTelemetryStep;
  message?: string | undefined;
  current?: number | undefined;
  total?: number | undefined;
  elapsedMs?: number | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface PublishLogOptions extends PublishTelemetryOptions {
  source: GenerationTelemetrySource;
  level: 'info' | 'warn' | 'error';
  message: string;
  status?: GenerationStatus | undefined;
  step?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface GenerationTelemetry {
  startRun(generationId: string): string;
  publishMilestone(
    options: PublishMilestoneOptions
  ): Extract<GenerationEvent, { type: 'telemetry' }>;
  publishProgress(
    options: PublishProgressOptions
  ): Extract<GenerationEvent, { type: 'telemetry' }>;
  publishLog(options: PublishLogOptions): Extract<GenerationEvent, { type: 'telemetry' }>;
  clearRun(generationId: string): void;
}

function omitUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined)
  ) as T;
}

class DefaultGenerationTelemetry implements GenerationTelemetry {
  readonly #eventBus: GenerationEventBus;
  readonly #now: () => Date;
  readonly #contexts = new Map<string, TelemetryContext>();

  constructor(options: GenerationTelemetryOptions) {
    this.#eventBus = options.eventBus;
    this.#now = options.now;
  }

  startRun(generationId: string): string {
    const runId = randomUUID();
    this.#contexts.set(generationId, {
      runId,
      sequence: 0
    });
    return runId;
  }

  publishMilestone(
    options: PublishMilestoneOptions
  ): Extract<GenerationEvent, { type: 'telemetry' }> {
    const { generationId, occurredAt, ...telemetry } = options;

    return this.#publish(
      generationId,
      occurredAt,
      omitUndefinedValues({
        kind: 'milestone',
        ...telemetry
      })
    );
  }

  publishProgress(
    options: PublishProgressOptions
  ): Extract<GenerationEvent, { type: 'telemetry' }> {
    const { generationId, occurredAt, ...telemetry } = options;

    return this.#publish(
      generationId,
      occurredAt,
      omitUndefinedValues({
        kind: 'progress',
        ...telemetry
      })
    );
  }

  publishLog(
    options: PublishLogOptions
  ): Extract<GenerationEvent, { type: 'telemetry' }> {
    const { generationId, occurredAt, ...telemetry } = options;

    return this.#publish(
      generationId,
      occurredAt,
      omitUndefinedValues({
        kind: 'log',
        ...telemetry
      })
    );
  }

  clearRun(generationId: string): void {
    this.#contexts.delete(generationId);
  }

  #publish(
    generationId: string,
    occurredAt: string | undefined,
    telemetry: GenerationTelemetryPayload
  ): Extract<GenerationEvent, { type: 'telemetry' }> {
    const context = this.#ensureContext(generationId);
    context.sequence += 1;

    const event = {
      type: 'telemetry' as const,
      generationId,
      runId: context.runId,
      sequence: context.sequence,
      occurredAt: occurredAt ?? this.#now().toISOString(),
      telemetry
    };

    this.#eventBus.publish(event);
    return event;
  }

  #ensureContext(generationId: string): TelemetryContext {
    let context = this.#contexts.get(generationId);
    if (context !== undefined) {
      return context;
    }

    context = {
      runId: randomUUID(),
      sequence: 0
    };
    this.#contexts.set(generationId, context);
    return context;
  }
}

export function createGenerationTelemetry(
  options: GenerationTelemetryOptions
): GenerationTelemetry {
  return new DefaultGenerationTelemetry(options);
}
