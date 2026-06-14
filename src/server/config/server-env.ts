import envSchema, { type JSONSchemaType } from 'env-schema';
import type { LevelWithSilent } from 'pino';

export interface ServerEnv {
  CONFIG_PATH: string;
  DATABASE_URL: string;
  HOST: string;
  PORT: number;
  LOG_LEVEL: LevelWithSilent;
  LOG_FILE_PATH: string;
}

const serverEnvSchema: JSONSchemaType<ServerEnv> = {
  type: 'object',
  required: ['CONFIG_PATH', 'DATABASE_URL', 'HOST', 'PORT', 'LOG_LEVEL', 'LOG_FILE_PATH'],
  properties: {
    CONFIG_PATH: {
      type: 'string',
      minLength: 1
    },
    DATABASE_URL: {
      type: 'string',
      minLength: 1
    },
    HOST: {
      type: 'string',
      minLength: 1
    },
    PORT: {
      type: 'integer',
      minimum: 1,
      maximum: 65_535
    },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
    },
    LOG_FILE_PATH: {
      type: 'string',
      minLength: 1
    }
  }
};

export function parseServerEnv(data: Record<string, string | undefined>): ServerEnv {
  return envSchema<ServerEnv>({
    schema: serverEnvSchema,
    data,
    env: false
  });
}

export function loadServerEnv(dotenvPath = '.env'): ServerEnv {
  try {
    process.loadEnvFile(dotenvPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return envSchema<ServerEnv>({
    schema: serverEnvSchema
  });
}
