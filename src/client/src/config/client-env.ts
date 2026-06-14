import envSchema, { type JSONSchemaType } from 'env-schema';

export interface ClientEnv {
  VITE_HOST: string;
  VITE_PORT: number;
}

const clientEnvSchema: JSONSchemaType<ClientEnv> = {
  type: 'object',
  required: ['VITE_HOST', 'VITE_PORT'],
  properties: {
    VITE_HOST: {
      type: 'string',
      minLength: 1
    },
    VITE_PORT: {
      type: 'integer',
      minimum: 1,
      maximum: 65_535
    }
  }
};

export function parseClientEnv(data: Record<string, string | undefined>): ClientEnv {
  return envSchema<ClientEnv>({
    schema: clientEnvSchema,
    data,
    env: false
  });
}
