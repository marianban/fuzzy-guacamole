// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { loadAppConfig } from './config.js';

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createValidConfig() {
  return {
    comfyBaseUrl: 'http://127.0.0.1:8188',
    ssh: {
      host: '192.168.1.10',
      port: 22,
      username: 'user',
      privateKeyPath: '/home/user/.ssh/id_ed25519'
    },
    remoteStart: {
      startComfyCommand: 'systemctl --user start comfy'
    },
    wol: {
      mac: 'AA:BB:CC:DD:EE:FF',
      broadcast: '192.168.1.255',
      port: 9
    },
    paths: {
      presets: '/data/presets',
      inputs: '/data/inputs',
      outputs: '/data/outputs'
    },
    timeouts: {
      pcBootMs: 60000,
      sshPollMs: 1000,
      comfyBootMs: 120000,
      healthPollMs: 1000,
      historyPollMs: 1000
    }
  };
}

describe('loadAppConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_valid_json_when_loading_config_then_returns_validated_config', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const configPath = path.join(tempDir, 'config.json');
    const expectedConfig = createValidConfig();
    await writeJsonFile(configPath, expectedConfig);

    await expect(loadAppConfig({ configPath })).resolves.toEqual(expectedConfig);
  });

  it('given_missing_file_when_loading_config_then_throws_read_error', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const missingPath = path.join(tempDir, 'missing.json');
    await expect(loadAppConfig({ configPath: missingPath })).rejects.toThrow(
      /Failed to read config/
    );
  });

  it('given_invalid_json_when_loading_config_then_throws_parse_error', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const configPath = path.join(tempDir, 'config.json');
    await writeFile(configPath, '{ "comfyBaseUrl": ', 'utf8');

    await expect(loadAppConfig({ configPath })).rejects.toThrow(/is not valid JSON/);
  });

  it('given_schema_violation_when_loading_config_then_throws_validation_error', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const configPath = path.join(tempDir, 'config.json');
    const invalidConfig = {
      ...createValidConfig(),
      ssh: {
        ...createValidConfig().ssh,
        port: -1
      }
    };
    await writeJsonFile(configPath, invalidConfig);

    await expect(loadAppConfig({ configPath })).rejects.toThrow(
      /Config at .* is invalid: .*ssh\.port/
    );
  });
});
