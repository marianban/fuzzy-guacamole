import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { AppDatabase } from './client.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDir, '../../../drizzle');

export interface RunDatabaseMigrationsOptions {
  migrationsSchema?: string;
  migrationsTable?: string;
}

export async function runDatabaseMigrations(
  database: AppDatabase,
  options: RunDatabaseMigrationsOptions = {}
): Promise<void> {
  await migrate(database.db, {
    migrationsFolder,
    ...options
  });
}
