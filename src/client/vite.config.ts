import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

import { parseClientEnv } from './src/config/client-env';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

export default defineConfig(({ mode }) => {
  const env = parseClientEnv(loadEnv(mode, repoRoot, 'VITE_'));
  const apiTarget = `http://${env.VITE_HOST}:${env.VITE_PORT}`;

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
