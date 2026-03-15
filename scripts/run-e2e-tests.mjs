#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const extraVitestArgs = process.argv.slice(2);

const env = {
  ...process.env,
  API_TEST_MODE: 'local',
  COMFY_TEST_MODE: 'local',
  API_RUN_LOCAL_TESTS: '1',
  COMFY_RUN_LOCAL_TESTS: '1'
};

const vitestCli = new URL('../node_modules/vitest/vitest.mjs', import.meta.url);
const vitestCliPath = fileURLToPath(vitestCli);

const result = spawnSync(
  process.execPath,
  [vitestCliPath, 'run', '.e2e.test.ts', ...extraVitestArgs],
  { stdio: 'inherit', env }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
