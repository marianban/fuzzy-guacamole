// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

interface PackageJson {
  scripts?: Record<string, string>;
}

describe('test npm scripts', () => {
  test('given_package_json_when_defining_unit_and_e2e_modes_then_expected_commands_exist_and_legacy_commands_are_removed', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, '../../package.json');
    const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as PackageJson;
    const scripts = packageJson.scripts ?? {};

    expect(scripts['test:unit']).toBe('node scripts/run-unit-tests.mjs');
    expect(scripts['test']).toBe(scripts['test:unit']);
    expect(scripts['test:e2e']).toBe('node scripts/run-e2e-tests.mjs');

    expect(scripts['test:integration:memory']).toBeUndefined();
    expect(scripts['test:integration:local']).toBeUndefined();

    expect(scripts['test:api:memory']).toBeUndefined();
    expect(scripts['test:api:local']).toBeUndefined();
    expect(scripts['test:comfy:mock']).toBeUndefined();
    expect(scripts['test:comfy:local']).toBeUndefined();
  });
});
