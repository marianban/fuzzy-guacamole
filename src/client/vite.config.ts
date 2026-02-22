import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(currentDir, '../shared')
    }
  },
  server: {
    port: 5173,
    proxy: {
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
