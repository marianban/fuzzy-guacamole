import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceNodeModules = path.resolve(currentDir, 'node_modules');
export default defineConfig({
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  resolve: {
    alias: {
      '@shared': path.resolve(currentDir, 'src/shared')
    },
    dedupe: ['react', 'react-dom']
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'jsdom',
          setupFiles: ['src/client/src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook')
          })
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium'
              }
            ]
          }
        }
      }
    ]
  }
});
