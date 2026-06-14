import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, 'VITE_');
  const apiHost = env.VITE_HOST;
  const apiPort = Number(env.VITE_PORT);

  if (!apiHost || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) {
    throw new Error('VITE_HOST and VITE_PORT must define a valid API proxy target.');
  }

  const apiTarget = `http://${apiHost}:${apiPort}`;

  return {
    root: currentDir,
    envDir: repoRoot,
    plugins: [
      devtools(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react()
    ],
    resolve: {
      alias: {
        '#root': path.resolve(currentDir, 'src'),
        '@shared': path.resolve(currentDir, '../shared')
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/openapi': {
          target: apiTarget,
          changeOrigin: true
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: '../../dist/client',
      emptyOutDir: true
    }
  };
});
