import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceNodeModules = path.resolve(currentDir, '../../node_modules');

export default defineConfig({
  root: currentDir,
  plugins: [
    devtools(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react()
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(currentDir, '../shared'),
      react: path.resolve(workspaceNodeModules, 'react'),
      'react/jsx-runtime': path.resolve(workspaceNodeModules, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(
        workspaceNodeModules,
        'react/jsx-dev-runtime.js'
      ),
      'react-dom': path.resolve(workspaceNodeModules, 'react-dom'),
      'react-dom/client': path.resolve(workspaceNodeModules, 'react-dom/client.js')
    },
    dedupe: ['react', 'react-dom']
  },
  server: {
    port: 5173,
    proxy: {
      '/openapi': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true
  }
});
