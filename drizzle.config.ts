import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile?.();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL environment variable is required.');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/server/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl
  }
});
