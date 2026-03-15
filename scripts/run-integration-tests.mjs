#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];

if (mode !== 'memory' && mode !== 'local') {
  console.error('Usage: node scripts/run-integration-tests.mjs <memory|local>');
  process.exit(1);
}

const env = {
  ...process.env,
  API_TEST_MODE: mode === 'local' ? 'local' : 'memory',
  COMFY_TEST_MODE: mode === 'local' ? 'local' : 'mock',
  API_RUN_LOCAL_TESTS: mode === 'local' ? '1' : '0',
  COMFY_RUN_LOCAL_TESTS: mode === 'local' ? '1' : '0'
};

const vitestCli = new URL('../node_modules/vitest/vitest.mjs', import.meta.url);
const vitestCliPath = fileURLToPath(vitestCli);

const result = spawnSync(
  process.execPath,
  [
    vitestCliPath,
    'run',
    'src/server/api.integration.test.ts',
    'src/server/comfy/client.integration.test.ts'
  ],
  { stdio: 'inherit', env }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
