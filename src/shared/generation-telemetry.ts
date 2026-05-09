export const generationTelemetrySourceValues = [
  'api',
  'worker',
  'processor',
  'comfy'
] as const;

export const generationTelemetrySources = {
  api: 'api',
  worker: 'worker',
  processor: 'processor',
  comfy: 'comfy'
} as const;

export type GenerationTelemetrySource = (typeof generationTelemetrySourceValues)[number];

export const generationTelemetryStepValues = [
  'prompt-request-recorded',
  'prompt-submitted',
  'waiting-for-history',
  'output-stored'
] as const;

export const generationTelemetrySteps = {
  promptRequestRecorded: 'prompt-request-recorded',
  promptSubmitted: 'prompt-submitted',
  waitingForHistory: 'waiting-for-history',
  outputStored: 'output-stored'
} as const;

export type GenerationTelemetryStep = (typeof generationTelemetryStepValues)[number];
