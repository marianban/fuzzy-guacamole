import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  resolve: {
    alias: {
      '@shared': path.resolve(currentDir, 'src/shared')
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['src/client/src/test/setup.ts'],
          include: ['src/client/src/**/*.{test}.{ts,tsx}']
        }
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.{test}.{ts}']
        }
      },
      {
        extends: true,
        test: {
          name: 'shared',
          environment: 'node',
          include: ['src/shared/**/*.{test}.{ts}']
        }
      }
    ]
  }
});
