// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

describe('test runner conventions', () => {
  test('given_unit_runner_when_running_default_tests_then_e2e_files_are_excluded', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const unitRunnerPath = path.resolve(currentDir, '../../scripts/run-unit-tests.mjs');
    const unitRunnerSource = await readFile(unitRunnerPath, 'utf8');

    expect(unitRunnerSource).toContain('--exclude');
    expect(unitRunnerSource).toContain('**/*.e2e.test.ts');
  });

  test('given_e2e_runner_when_running_e2e_suite_then_only_e2e_glob_is_targeted', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const e2eRunnerPath = path.resolve(currentDir, '../../scripts/run-e2e-tests.mjs');
    const e2eRunnerSource = await readFile(e2eRunnerPath, 'utf8');

    expect(e2eRunnerSource).toContain('.e2e.test.ts');
    expect(e2eRunnerSource).not.toContain('api.unit.test.ts');
    expect(e2eRunnerSource).not.toContain('client.unit.test.ts');
  });

  test('given_test_files_when_executed_by_dedicated_runners_then_mode_switches_are_not_embedded_in_tests', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.resolve(currentDir, './api.test.ts'),
      path.resolve(currentDir, './api.e2e.test.ts'),
      path.resolve(currentDir, './comfy/client.mock-replay.test.ts'),
      path.resolve(currentDir, './comfy/client.e2e.test.ts')
    ];

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      expect(source).not.toContain('runIf(');
      expect(source).not.toContain('API_TEST_MODE');
      expect(source).not.toContain('COMFY_TEST_MODE');
      expect(source).not.toContain('API_RUN_LOCAL_TESTS');
      expect(source).not.toContain('COMFY_RUN_LOCAL_TESTS');
    }
  });
});
