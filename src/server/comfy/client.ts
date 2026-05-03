import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { FetchError, ofetch, type $Fetch, type FetchOptions } from 'ofetch';
import { z } from 'zod';

const promptResponseSchema = z.object({
  prompt_id: z.string(),
  number: z.number().optional(),
  node_errors: z.record(z.string(), z.unknown()).optional()
});

const uploadResponseSchema = z
  .object({
    name: z.string().optional(),
    filename: z.string().optional(),
    subfolder: z.string().optional(),
    type: z.string().optional()
  })
  .refine((value) => value.name !== undefined || value.filename !== undefined, {
    message: 'Upload response must include name or filename.'
  });

const historyDetailSchema = z.record(
  z.string(),
  z.object({
    outputs: z.record(z.string(), z.unknown()).optional()
  })
);

const systemStatsSchema = z.object({
  system: z.object({
    comfyui_version: z.string().optional(),
    pytorch_version: z.string().optional()
  }),
  devices: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      vram_total: z.number().optional(),
      vram_free: z.number().optional()
    })
  )
});

const errorMessageSchema = z.object({
  message: z.string()
});

export interface ComfyClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  historyPollMs?: number;
  historyTimeoutMs?: number;
}

export interface ComfyImageRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface ComfyOutputImage extends ComfyImageRef {
  nodeId: string;
}

export interface ComfyUploadResult {
  comfyImageRef: string;
  image: ComfyImageRef;
}

export interface ComfyPromptSubmission {
  promptId: string;
  queueNumber?: number;
  nodeErrors?: Record<string, unknown>;
}

export interface ComfyHistoryPollResult {
  history: Record<string, { outputs?: Record<string, unknown> | undefined }>;
  entry: { outputs?: Record<string, unknown> | undefined };
}

export interface ComfyHealthCheckResult {
  ok: boolean;
  systemStats?: z.infer<typeof systemStatsSchema>;
}

interface BaseRequestInit {
  method?: string;
  headers?: RequestInit['headers'];
  signal?: AbortSignal;
  query?: Record<string, string>;
}

interface JsonRequestInit extends BaseRequestInit {
  body?: RequestInit['body'] | Record<string, unknown>;
}

type BinaryRequestInit = BaseRequestInit;

interface ComfyRequestOptions {
  signal?: AbortSignal;
}

const DEFAULT_HISTORY_POLL_MS = 1_000;
const DEFAULT_HISTORY_TIMEOUT_MS = 180_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class ComfyClient {
  private readonly http: $Fetch;
  private readonly requestTimeoutMs: number;
  private readonly historyPollMs: number;
  private readonly historyTimeoutMs: number;

  constructor(options: ComfyClientOptions) {
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.historyPollMs = options.historyPollMs ?? DEFAULT_HISTORY_POLL_MS;
    this.historyTimeoutMs = options.historyTimeoutMs ?? DEFAULT_HISTORY_TIMEOUT_MS;
    this.http = ofetch.create(
      {
        baseURL: baseUrl,
        retry: 0
      },
      options.fetchImpl !== undefined ? { fetch: options.fetchImpl } : undefined
    );
  }

  async healthCheck(options: ComfyRequestOptions = {}): Promise<ComfyHealthCheckResult> {
    const { signal, timeoutSignal } = this.createRequestSignal(options.signal);

    try {
      const response = await this.http.raw('/api/system_stats', {
        signal,
        ignoreResponseError: true
      });

      if (!response.ok) {
        return { ok: false };
      }

      const parsed = systemStatsSchema.safeParse(response._data);
      if (!parsed.success) {
        return { ok: false };
      }

      return { ok: true, systemStats: parsed.data };
    } catch (error) {
      if (timeoutSignal.aborted && !options.signal?.aborted) {
        return { ok: false };
      }

      throw error;
    }
  }

  async submitPrompt(
    workflow: Record<string, unknown>,
    options: ComfyRequestOptions = {}
  ): Promise<ComfyPromptSubmission> {
    const parsed = promptResponseSchema.parse(
      await this.requestJson(
        '/api/prompt',
        {
          method: 'POST',
          body: { prompt: workflow },
          ...(options.signal !== undefined ? { signal: options.signal } : {})
        },
        'submit prompt'
      )
    );

    return {
      promptId: parsed.prompt_id,
      ...(parsed.number !== undefined ? { queueNumber: parsed.number } : {}),
      ...(parsed.node_errors !== undefined ? { nodeErrors: parsed.node_errors } : {})
    };
  }

  async uploadInputImage(
    filePath: string,
    options: ComfyRequestOptions = {}
  ): Promise<ComfyUploadResult> {
    const fileBytes = await readFile(filePath);
    const form = new FormData();
    form.set(
      'image',
      new Blob([fileBytes], { type: 'image/png' }),
      path.basename(filePath)
    );
    form.set('type', 'input');
    form.set('overwrite', 'true');

    const parsed = uploadResponseSchema.parse(
      await this.requestJson(
        '/api/upload/image',
        {
          method: 'POST',
          body: form,
          ...(options.signal !== undefined ? { signal: options.signal } : {})
        },
        'upload image'
      )
    );

    const filename = parsed.name ?? parsed.filename;
    if (filename === undefined) {
      throw new Error('Upload response did not include a filename.');
    }

    const image: ComfyImageRef = {
      filename,
      ...(parsed.subfolder !== undefined ? { subfolder: parsed.subfolder } : {}),
      type: parsed.type ?? 'input'
    };

    return {
      comfyImageRef: buildComfyImageRef(image),
      image
    };
  }

  async interrupt(): Promise<void> {
    await this.requestJson('/api/interrupt', { method: 'POST' }, 'interrupt execution');
  }

  async getHistoryForPrompt(
    promptId: string,
    options: ComfyRequestOptions = {}
  ): Promise<Record<string, { outputs?: Record<string, unknown> | undefined }>> {
    const encodedPromptId = encodeURIComponent(promptId);
    const historyJson = await this.requestJson(
      `/history/${encodedPromptId}`,
      options.signal !== undefined ? { signal: options.signal } : undefined,
      `load history for prompt ${promptId}`
    );
    return historyDetailSchema.parse(historyJson);
  }

  async pollHistory(
    promptId: string,
    overrides: { pollMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<ComfyHistoryPollResult> {
    const pollMs = overrides.pollMs ?? this.historyPollMs;
    const timeoutMs = overrides.timeoutMs ?? this.historyTimeoutMs;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      throwIfAborted(overrides.signal);
      const history = await this.getHistoryForPrompt(
        promptId,
        overrides.signal !== undefined ? { signal: overrides.signal } : {}
      );
      const entry = history[promptId];

      if (entry?.outputs !== undefined && Object.keys(entry.outputs).length > 0) {
        return { history, entry };
      }

      await sleep(
        pollMs,
        undefined,
        overrides.signal ? { signal: overrides.signal } : undefined
      );
    }

    throw new Error(`History timeout for prompt ${promptId} after ${timeoutMs}ms.`);
  }

  async downloadImage(
    image: ComfyImageRef,
    options: ComfyRequestOptions = {}
  ): Promise<Buffer> {
    const buffer = await this.requestBinary(
      '/api/view',
      {
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        query: {
          filename: image.filename,
          ...(image.subfolder !== undefined && image.subfolder.length > 0
            ? { subfolder: image.subfolder }
            : {}),
          ...(image.type !== undefined && image.type.length > 0
            ? { type: image.type }
            : {})
        }
      },
      `download image ${image.filename}`
    );

    return buffer;
  }

  private async requestBinary(
    path: string,
    init: BinaryRequestInit | undefined,
    actionLabel: string
  ): Promise<Buffer> {
    const originalSignal = init?.signal;
    const { signal, timeoutSignal } = this.createRequestSignal(originalSignal);
    const requestPath = buildRequestPath(path, init?.query);
    const requestOptions: FetchOptions<'arrayBuffer'> = {
      ...(init?.method !== undefined ? { method: init.method } : {}),
      ...(init?.headers !== undefined ? { headers: init.headers } : {}),
      ...(init?.query !== undefined ? { query: init.query } : {}),
      signal,
      responseType: 'arrayBuffer'
    };

    try {
      const response = await this.http.raw<ArrayBuffer, 'arrayBuffer'>(
        path,
        requestOptions
      );

      if (response.ok) {
        return Buffer.from(response._data ?? new ArrayBuffer(0));
      }
    } catch (error) {
      if (timeoutSignal.aborted && !originalSignal?.aborted) {
        throw new Error(`${actionLabel} timed out after ${this.requestTimeoutMs}ms.`);
      }

      if (error instanceof FetchError) {
        throw buildBinaryRequestError(
          actionLabel,
          requestPath,
          error.response?.status,
          error.response?.headers.get('content-type'),
          error.data
        );
      }

      throw error;
    }

    throw new Error(`download image ${requestPath} returned no data.`);
  }

  private async requestJson(
    path: string,
    init: JsonRequestInit | undefined,
    actionLabel: string
  ): Promise<unknown> {
    const originalSignal = init?.signal;
    const { signal, timeoutSignal } = this.createRequestSignal(originalSignal);
    const requestPath = buildRequestPath(path, init?.query);
    const requestOptions: FetchOptions = {
      ...(init?.method !== undefined ? { method: init.method } : {}),
      ...(init?.headers !== undefined ? { headers: init.headers } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
      ...(init?.query !== undefined ? { query: init.query } : {}),
      signal
    };

    try {
      const response = await this.http.raw(path, requestOptions);

      if (response.ok) {
        return response._data ?? {};
      }
    } catch (error) {
      if (timeoutSignal.aborted && !originalSignal?.aborted) {
        throw new Error(`${actionLabel} timed out after ${this.requestTimeoutMs}ms.`);
      }

      if (error instanceof FetchError) {
        throw buildJsonRequestError(
          actionLabel,
          requestPath,
          error.response?.status,
          error.response?.headers.get('content-type'),
          error.data
        );
      }

      throw error;
    }

    return {};
  }

  private createRequestSignal(signal: AbortSignal | undefined): {
    signal: AbortSignal;
    timeoutSignal: AbortSignal;
  } {
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);

    return {
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      timeoutSignal
    };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function buildComfyImageRef(image: ComfyImageRef): string {
  if (image.subfolder === undefined || image.subfolder.length === 0) {
    return image.filename;
  }

  return `${image.subfolder}/${image.filename}`;
}

export function setLoadImageReference(
  workflow: Record<string, unknown>,
  comfyImageRef: string,
  loadImageNodeId?: string
): Record<string, unknown> {
  const nodeEntries = Object.entries(workflow);
  const targetNode = loadImageNodeId
    ? nodeEntries.find(([nodeId]) => nodeId === loadImageNodeId)
    : nodeEntries.find(([, value]) => {
        if (typeof value !== 'object' || value === null) {
          return false;
        }
        return (value as { class_type?: unknown }).class_type === 'LoadImage';
      });

  if (targetNode === undefined) {
    throw new Error('LoadImage node was not found in workflow.');
  }

  const [targetNodeId, currentNodeValue] = targetNode;
  if (typeof currentNodeValue !== 'object' || currentNodeValue === null) {
    throw new Error(`Workflow node ${targetNodeId} is invalid.`);
  }

  const currentInputs =
    'inputs' in currentNodeValue &&
    typeof currentNodeValue.inputs === 'object' &&
    currentNodeValue.inputs !== null
      ? (currentNodeValue.inputs as Record<string, unknown>)
      : {};

  return {
    ...workflow,
    [targetNodeId]: {
      ...currentNodeValue,
      inputs: {
        ...currentInputs,
        image: comfyImageRef
      }
    }
  };
}

export function extractDeterministicOutputImage(
  history: Record<string, { outputs?: Record<string, unknown> | undefined }>,
  promptId: string,
  preferredSaveNodeId?: string
): ComfyOutputImage {
  const entry = history[promptId];
  if (entry === undefined || entry.outputs === undefined) {
    throw new Error(`No history entry with outputs found for prompt ${promptId}.`);
  }

  const nodeIds = Object.keys(entry.outputs);
  if (preferredSaveNodeId !== undefined && nodeIds.includes(preferredSaveNodeId)) {
    const preferred = extractImageFromNodeOutput(
      preferredSaveNodeId,
      entry.outputs[preferredSaveNodeId]
    );
    if (preferred !== undefined) {
      return preferred;
    }
  }

  const sortedNodeIds = nodeIds.sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });

  for (const nodeId of sortedNodeIds) {
    const found = extractImageFromNodeOutput(nodeId, entry.outputs[nodeId]);
    if (found !== undefined) {
      return found;
    }
  }

  throw new Error(`No output images found for prompt ${promptId}.`);
}

function extractImageFromNodeOutput(
  nodeId: string,
  nodeOutput: unknown
): ComfyOutputImage | undefined {
  if (typeof nodeOutput !== 'object' || nodeOutput === null) {
    return undefined;
  }

  const candidateArrays = ['images', 'gifs', 'video', 'audio']
    .map((key) =>
      key in nodeOutput ? (nodeOutput as Record<string, unknown>)[key] : undefined
    )
    .filter(Array.isArray);

  for (const candidateArray of candidateArrays) {
    const first = candidateArray[0];
    if (typeof first !== 'object' || first === null) {
      continue;
    }

    const filenameValue = (first as Record<string, unknown>).filename;
    if (typeof filenameValue !== 'string' || filenameValue.length === 0) {
      continue;
    }

    const subfolderValue = (first as Record<string, unknown>).subfolder;
    const typeValue = (first as Record<string, unknown>).type;
    return {
      nodeId,
      filename: filenameValue,
      ...(typeof subfolderValue === 'string' ? { subfolder: subfolderValue } : {}),
      ...(typeof typeValue === 'string' ? { type: typeValue } : {})
    };
  }

  return undefined;
}

function extractJsonResponseMessage(body: unknown): string {
  const parsed = errorMessageSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data.message;
  }

  return JSON.stringify(body);
}

function extractJsonRequestErrorMessage(
  body: unknown,
  contentType: string | null | undefined
): string {
  if (body === undefined || body === null) {
    return '';
  }

  if (typeof body === 'string') {
    if (body.length === 0) {
      return '';
    }

    if (isJsonResponseContentType(contentType)) {
      try {
        return extractJsonResponseMessage(JSON.parse(body) as unknown);
      } catch {
        return body;
      }
    }

    return body;
  }

  if (
    isJsonResponseContentType(contentType) ||
    contentType === undefined ||
    contentType === null
  ) {
    return extractJsonResponseMessage(body);
  }

  return JSON.stringify(body);
}

function extractBinaryRequestErrorMessage(
  body: unknown,
  contentType: string | null | undefined
): string {
  if (body === undefined || body === null) {
    return '';
  }

  if (body instanceof ArrayBuffer) {
    if (!isTextResponseContentType(contentType)) {
      return '';
    }

    return extractJsonRequestErrorMessage(new TextDecoder().decode(body), contentType);
  }

  return extractJsonRequestErrorMessage(body, contentType);
}

function isJsonResponseContentType(contentType: string | null | undefined): boolean {
  return contentType?.toLowerCase().includes('json') ?? false;
}

function isTextResponseContentType(contentType: string | null | undefined): boolean {
  if (contentType === undefined || contentType === null) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase();
  return (
    normalizedContentType.startsWith('text/') || normalizedContentType.includes('json')
  );
}

function buildRequestPath(
  path: string,
  query: Record<string, string> | undefined
): string {
  if (query === undefined || Object.keys(query).length === 0) {
    return path;
  }

  return `${path}?${new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)])
  ).toString()}`;
}

function buildJsonRequestError(
  actionLabel: string,
  requestPath: string,
  status: number | undefined,
  contentType: string | null | undefined,
  body: unknown
): Error {
  const message = extractJsonRequestErrorMessage(body, contentType);
  return new Error(`${actionLabel} failed at ${requestPath}: ${status ?? 0} ${message}`);
}

function buildBinaryRequestError(
  actionLabel: string,
  requestPath: string,
  status: number | undefined,
  contentType: string | null | undefined,
  body: unknown
): Error {
  const message = extractBinaryRequestErrorMessage(body, contentType);
  return new Error(`${actionLabel} failed at ${requestPath}: ${status ?? 0} ${message}`);
}
