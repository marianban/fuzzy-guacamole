import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

export type AppDrizzleDatabase = NodePgDatabase<typeof schema>;

export interface AppDatabase {
  db: AppDrizzleDatabase;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  connectionString?: string;
  schema?: string;
}

export function createDatabase(options: CreateDatabaseOptions = {}): AppDatabase {
  const connectionString = withSchemaSearchPath(
    options.connectionString ?? requireDatabaseUrl(),
    options.schema
  );
  const pool = new Pool({ connectionString });

  return {
    db: drizzle(pool, { schema }),
    async close() {
      await pool.end();
    }
  };
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error('DATABASE_URL environment variable is required.');
  }

  return databaseUrl;
}

function withSchemaSearchPath(
  connectionString: string,
  schema: string | undefined
): string {
  if (schema === undefined) {
    return connectionString;
  }

  const url = new URL(connectionString);
  const currentOptions = url.searchParams.get('options');
  const schemaOption = `-c search_path=${schema}`;
  url.searchParams.set(
    'options',
    currentOptions === null ? schemaOption : `${currentOptions} ${schemaOption}`
  );
  return url.toString();
}
