// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

interface PackageJson {
  scripts?: Record<string, string>;
}

describe('integration npm scripts', () => {
  test('given_package_json_when_defining_integration_modes_then_only_two_main_commands_exist', async () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, '../../package.json');
    const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as PackageJson;
    const scripts = packageJson.scripts ?? {};

    expect(scripts['test:integration:memory']).toBe(
      'node scripts/run-integration-tests.mjs memory'
    );
    expect(scripts['test:integration:local']).toBe(
      'node scripts/run-integration-tests.mjs local'
    );

    expect(scripts['test:api:memory']).toBeUndefined();
    expect(scripts['test:api:local']).toBeUndefined();
    expect(scripts['test:comfy:mock']).toBeUndefined();
    expect(scripts['test:comfy:local']).toBeUndefined();
  });
});
