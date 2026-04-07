import { randomUUID } from 'node:crypto';

import { Client } from 'pg';

import { createDatabase, type AppDatabase } from './client.js';
import { runDatabaseMigrations } from './migrate.js';
import { requireTestEnvVar } from '../test-support/test-env.js';

try {
  process.loadEnvFile?.();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

export interface TestDatabaseContext {
  createAppDatabase(): AppDatabase;
  migrate(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createTestDatabaseContext(): Promise<TestDatabaseContext> {
  const connectionString = requireTestEnvVar('DATABASE_URL');
  const schema = `test_${randomUUID().replaceAll('-', '_')}`;
  const adminClient = new Client({ connectionString });
  await adminClient.connect();
  try {
    await adminClient.query(`create schema "${schema}"`);
  } catch (error) {
    await adminClient.end();
    throw error;
  }

  return {
    createAppDatabase() {
      return createDatabase({
        connectionString,
        schema
      });
    },
    async migrate() {
      const database = createDatabase({
        connectionString,
        schema
      });
      try {
        await runDatabaseMigrations(database, {
          migrationsSchema: schema
        });
      } finally {
        await database.close();
      }
    },
    async dispose() {
      await adminClient.query(`drop schema if exists "${schema}" cascade`);
      await adminClient.end();
    }
  };
}
