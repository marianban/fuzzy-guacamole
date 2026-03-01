import { readFile } from 'node:fs/promises';

import { z } from 'zod';

export const appConfigSchema = z.object({
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
    historyPollMs: z.number().int().positive()
  })
});

export type AppConfig = z.infer<typeof appConfigSchema>;

interface LoadAppConfigOptions {
  configPath?: string;
}

export async function loadAppConfig(
  options: LoadAppConfigOptions = {}
): Promise<AppConfig> {
  const configPath = options.configPath ?? process.env.CONFIG_PATH ?? '/data/config.json';

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

  const parsed = appConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      `Config at ${configPath} is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  }

  return parsed.data;
}
