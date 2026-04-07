// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

describe('test runner conventions', () => {
  test('given_unit_runner_when_running_default_tests_then_only_integration_files_are_excluded', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const unitRunnerPath = path.resolve(currentDir, '../../scripts/run-unit-tests.mjs');
    const unitRunnerSource = await readFile(unitRunnerPath, 'utf8');

    expect(unitRunnerSource).toContain('--exclude');
    expect(unitRunnerSource).toContain('**/*.int.test.ts');
    expect(unitRunnerSource.match(/--exclude/g)).toHaveLength(1);
  });

  test('given_explicit_integration_runner_when_running_integration_suite_then_only_integration_glob_is_targeted', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const integrationRunnerPath = path.resolve(
      currentDir,
      '../../scripts/run-int-tests.mjs'
    );
    const integrationRunnerSource = await readFile(integrationRunnerPath, 'utf8');

    expect(integrationRunnerSource).toContain('.int.test.ts');
    expect(integrationRunnerSource).toContain('00-preflight.int.test.ts');
    expect(integrationRunnerSource).toContain('--fileParallelism');
    expect(integrationRunnerSource).toContain('false');
    expect(integrationRunnerSource).toContain('--bail');
    expect(integrationRunnerSource).toContain('1');
    expect(integrationRunnerSource).toContain('loadEnvFile');
    expect(integrationRunnerSource).toContain('API_TEST_MODE');
    expect(integrationRunnerSource).toContain('COMFY_TEST_MODE');
    expect(integrationRunnerSource).not.toContain('api.unit.test.ts');
    expect(integrationRunnerSource).not.toContain('client.unit.test.ts');
  });

  test('given_test_files_when_executed_by_dedicated_runners_then_mode_switches_are_not_embedded_in_tests', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.resolve(currentDir, './00-preflight.int.test.ts'),
      path.resolve(currentDir, './api.test.ts'),
      path.resolve(currentDir, './api.int.test.ts'),
      path.resolve(currentDir, './db/db.int.test.ts'),
      path.resolve(currentDir, './comfy/client.mock-replay.test.ts'),
      path.resolve(currentDir, './comfy/client.int.test.ts')
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

  test('given_integration_files_when_resolving_required_urls_then_no_default_fallbacks_are_embedded', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.resolve(currentDir, './00-preflight.int.test.ts'),
      path.resolve(currentDir, './api.int.test.ts'),
      path.resolve(currentDir, './comfy/client.int.test.ts')
    ];

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      expect(source).not.toContain('process.env.CLIENT_BASE_URL ??');
      expect(source).not.toContain('process.env.API_BASE_URL ??');
      expect(source).not.toContain('process.env.COMFY_BASE_URL ??');
      expect(source).not.toContain('process.env.DATABASE_URL ??');
    }
  });

  test('given_wallaby_config_when_listing_ignored_tests_then_only_integration_files_are_skipped', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const wallabyConfigPath = path.resolve(currentDir, '../../wallaby.cjs');
    const wallabyConfigSource = await readFile(wallabyConfigPath, 'utf8');

    expect(wallabyConfigSource).toContain('**/*.int.test.{js,jsx,ts,tsx}');
    expect(wallabyConfigSource.match(/ignore: true/g)).toHaveLength(1);
  });
});
