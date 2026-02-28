import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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

export interface ComfyClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
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

interface JsonRequestInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

const DEFAULT_HISTORY_POLL_MS = 1_000;
const DEFAULT_HISTORY_TIMEOUT_MS = 180_000;

export class ComfyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly historyPollMs: number;
  private readonly historyTimeoutMs: number;

  constructor(options: ComfyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.historyPollMs = options.historyPollMs ?? DEFAULT_HISTORY_POLL_MS;
    this.historyTimeoutMs = options.historyTimeoutMs ?? DEFAULT_HISTORY_TIMEOUT_MS;
  }

  async healthCheck(): Promise<ComfyHealthCheckResult> {
    const response = await this.fetchImpl(this.buildUrl('/api/system_stats'));
    if (!response.ok) {
      return { ok: false };
    }

    const parsed = systemStatsSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false };
    }

    return { ok: true, systemStats: parsed.data };
  }

  async submitPrompt(workflow: Record<string, unknown>): Promise<ComfyPromptSubmission> {
    const parsed = promptResponseSchema.parse(
      await this.requestJsonWithFallback(
        ['/api/prompt', '/prompt'],
        {
          method: 'POST',
          body: { prompt: workflow }
        },
        'submit prompt'
      )
    );

    return {
      promptId: parsed.prompt_id,
      ...(parsed.number !== undefined ? { queueNumber: parsed.number } : {}),
      ...(parsed.node_errors !== undefined
        ? { nodeErrors: parsed.node_errors }
        : {})
    };
  }

  async uploadInputImage(filePath: string): Promise<ComfyUploadResult> {
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
      await this.requestJsonWithFallback(
        ['/api/upload/image', '/upload/image'],
        {
          method: 'POST',
          body: form
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
    await this.requestJsonWithFallback(
      ['/api/interrupt', '/interrupt'],
      {
        method: 'POST'
      },
      'interrupt execution'
    );
  }

  async getHistoryForPrompt(
    promptId: string
  ): Promise<Record<string, { outputs?: Record<string, unknown> | undefined }>> {
    const encodedPromptId = encodeURIComponent(promptId);
    const historyJson = await this.requestJsonWithFallback(
      [`/api/history_v2/${encodedPromptId}`, `/history/${encodedPromptId}`],
      undefined,
      `load history for prompt ${promptId}`
    );
    return historyDetailSchema.parse(historyJson);
  }

  async pollHistory(
    promptId: string,
    overrides: { pollMs?: number; timeoutMs?: number } = {}
  ): Promise<ComfyHistoryPollResult> {
    const pollMs = overrides.pollMs ?? this.historyPollMs;
    const timeoutMs = overrides.timeoutMs ?? this.historyTimeoutMs;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const history = await this.getHistoryForPrompt(promptId);
      const entry = history[promptId] ?? Object.values(history)[0];

      if (entry?.outputs !== undefined && Object.keys(entry.outputs).length > 0) {
        return { history, entry };
      }

      await sleep(pollMs);
    }

    throw new Error(`History timeout for prompt ${promptId} after ${timeoutMs}ms.`);
  }

  async downloadImage(image: ComfyImageRef): Promise<Buffer> {
    const search = new URLSearchParams({ filename: image.filename });
    if (image.subfolder !== undefined && image.subfolder.length > 0) {
      search.set('subfolder', image.subfolder);
    }
    if (image.type !== undefined && image.type.length > 0) {
      search.set('type', image.type);
    }

    const buffer = await this.requestBinaryWithFallback(
      [`/api/view?${search.toString()}`, `/view?${search.toString()}`],
      undefined,
      `download image ${image.filename}`
    );

    return buffer;
  }

  private async requestBinaryWithFallback(
    paths: string[],
    init: RequestInit | undefined,
    actionLabel: string
  ): Promise<Buffer> {
    let lastFailure: Error | undefined;
    for (const relativePath of paths) {
      const response = await this.fetchImpl(this.buildUrl(relativePath), init);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }

      if (response.status === 404) {
        lastFailure = new Error(
          `${actionLabel} failed at ${relativePath}: ${response.status}`
        );
        continue;
      }

      const message = await readResponseMessage(response);
      throw new Error(
        `${actionLabel} failed at ${relativePath}: ${response.status} ${message}`
      );
    }

    throw lastFailure ?? new Error(`${actionLabel} failed: no fallback paths left.`);
  }

  private async requestJsonWithFallback(
    paths: string[],
    init: JsonRequestInit | undefined,
    actionLabel: string
  ): Promise<unknown> {
    let lastFailure: Error | undefined;
    for (const relativePath of paths) {
      const headers = {
        ...(init?.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {})
      };

      const requestInit: RequestInit = {
        ...(init?.method !== undefined ? { method: init.method } : {}),
        headers
      };
      if (init?.body !== undefined) {
        requestInit.body =
          init.body instanceof FormData ? init.body : JSON.stringify(init.body);
      }

      const response = await this.fetchImpl(this.buildUrl(relativePath), requestInit);

      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          return response.json();
        }

        const textBody = await response.text();
        if (textBody.length === 0) {
          return {};
        }

        try {
          return JSON.parse(textBody) as unknown;
        } catch {
          return { message: textBody };
        }
      }

      if (response.status === 404) {
        lastFailure = new Error(
          `${actionLabel} failed at ${relativePath}: ${response.status}`
        );
        continue;
      }

      const message = await readResponseMessage(response);
      throw new Error(
        `${actionLabel} failed at ${relativePath}: ${response.status} ${message}`
      );
    }

    throw lastFailure ?? new Error(`${actionLabel} failed: no fallback paths left.`);
  }

  private buildUrl(relativePath: string): string {
    return `${this.baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
  }
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

  workflow[targetNodeId] = {
    ...currentNodeValue,
    inputs: {
      ...currentInputs,
      image: comfyImageRef
    }
  };

  return workflow;
}

export function extractDeterministicOutputImage(
  history: Record<string, { outputs?: Record<string, unknown> | undefined }>,
  promptId: string,
  preferredSaveNodeId?: string
): ComfyOutputImage {
  const entry = history[promptId] ?? Object.values(history)[0];
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

async function readResponseMessage(response: Response): Promise<string> {
  const body = await response.text();
  if (body.length === 0) {
    return '';
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      const message = (parsed as { message?: unknown }).message;
      return typeof message === 'string' ? message : body;
    }
    return body;
  } catch {
    return body;
  }
}
