#!/usr/bin/env node

try {
  process.loadEnvFile?.();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const { createDatabase } = await import('../dist/server/db/client.js')
  .catch(async () => import('../src/server/db/client.ts'));
const { runDatabaseMigrations } = await import('../dist/server/db/migrate.js')
  .catch(async () => import('../src/server/db/migrate.ts'));

const database = createDatabase();

try {
  await runDatabaseMigrations(database);
} finally {
  await database.close();
}
