import { readFile } from 'node:fs/promises';

import { z } from 'zod';

const appConfigSchema = z.object({
  comfyBaseUrl: z.url(),
  ssh: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    privateKeyPath: z.string().min(1)
  }),
  remoteStart: z.object({
    startComfyCommand: z.string().min(1)
  }),
  wol: z.object({
    mac: z.string().min(1),
    broadcast: z.string().min(1),
    port: z.number().int().positive()
  }),
  paths: z.object({
    presets: z.string().min(1),
    inputs: z.string().min(1),
    outputs: z.string().min(1)
  }),
  timeouts: z.object({
    pcBootMs: z.number().int().positive(),
    sshPollMs: z.number().int().positive(),
    comfyBootMs: z.number().int().positive(),
    healthPollMs: z.number().int().positive(),
    historyPollMs: z.number().int().positive(),
    submittedTimeoutMs: z.number().int().positive()
  })
});

export type AppConfig = z.infer<typeof appConfigSchema>;

interface LoadAppConfigOptions {
  configPath?: string;
}

const ENV_TOKEN_PATTERN = /^ENV:([A-Za-z_][A-Za-z0-9_]*)$/;

function resolveEnvTokens(
  value: unknown,
  pathParts: string[],
  configPath: string
): unknown {
  if (typeof value === 'string') {
    const match = ENV_TOKEN_PATTERN.exec(value);
    if (!match) {
      return value;
    }

    const envVarName = match[1];

    if (envVarName === undefined) {
      return value;
    }

    const envValue = process.env[envVarName];
    if (envValue === undefined) {
      const pathLabel = pathParts.join('.');
      throw new Error(
        `Config at ${configPath} references missing environment variable ${envVarName} at ${pathLabel}`
      );
    }
    return envValue;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveEnvTokens(item, [...pathParts, String(index)], configPath)
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [
        key,
        resolveEnvTokens(nestedValue, [...pathParts, key], configPath)
      ]
    );
    return Object.fromEntries(entries);
  }

  return value;
}

export async function loadAppConfig(
  options: LoadAppConfigOptions = {}
): Promise<AppConfig> {
  const configPath = options.configPath ?? process.env.CONFIG_PATH;

  if (!configPath) {
    throw new Error(
      'CONFIG_PATH environment variable is required when configPath is not provided'
    );
  }

  let rawContent: string;
  try {
    rawContent = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to read config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent) as unknown;
  } catch (error) {
    throw new Error(
      `Config at ${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const resolvedConfig = resolveEnvTokens(parsedJson, [], configPath);

  const parsed = appConfigSchema.safeParse(resolvedConfig);
  if (!parsed.success) {
    throw new Error(
      `Config at ${configPath} is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  }

  return parsed.data;
}
