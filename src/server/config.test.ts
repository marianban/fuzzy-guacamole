// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('given_no_explicit_path_when_local_data_config_exists_then_ignores_cwd_data_directory', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const originalCwd = process.cwd();
    const originalConfigPath = process.env.CONFIG_PATH;
    const configPath = path.join(tempDir, 'data', 'config.json');
    const expectedConfig = createValidConfig();

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeJsonFile(configPath, expectedConfig);

    process.chdir(tempDir);
    delete process.env.CONFIG_PATH;

    try {
      await expect(loadAppConfig()).rejects.toThrow(/CONFIG_PATH environment variable is required/);
    } finally {
      process.chdir(originalCwd);
      if (originalConfigPath === undefined) {
        delete process.env.CONFIG_PATH;
      } else {
        process.env.CONFIG_PATH = originalConfigPath;
      }
    }
  });

  it('given_config_path_env_when_loading_config_then_uses_env_config_path', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const originalConfigPath = process.env.CONFIG_PATH;
    const configPath = path.join(tempDir, 'config.json');
    const expectedConfig = createValidConfig();

    await writeJsonFile(configPath, expectedConfig);
    process.env.CONFIG_PATH = configPath;

    try {
      await expect(loadAppConfig()).resolves.toEqual(expectedConfig);
    } finally {
      if (originalConfigPath === undefined) {
        delete process.env.CONFIG_PATH;
      } else {
        process.env.CONFIG_PATH = originalConfigPath;
      }
    }
  });

  it('given_env_token_in_config_when_env_value_exists_then_resolves_token_before_validation', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const originalSshUsername = process.env.SSH_USERNAME;
    const configPath = path.join(tempDir, 'config.json');
    const configWithToken = {
      ...createValidConfig(),
      ssh: {
        ...createValidConfig().ssh,
        username: 'ENV:SSH_USERNAME'
      }
    };

    await writeJsonFile(configPath, configWithToken);
    process.env.SSH_USERNAME = 'secure-user';

    try {
      const loadedConfig = await loadAppConfig({ configPath });
      expect(loadedConfig.ssh.username).toBe('secure-user');
    } finally {
      if (originalSshUsername === undefined) {
        delete process.env.SSH_USERNAME;
      } else {
        process.env.SSH_USERNAME = originalSshUsername;
      }
    }
  });

  it('given_env_token_in_config_when_env_value_missing_then_throws_clear_error', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-config-'));
    tempDirs.push(tempDir);

    const originalSshUsername = process.env.SSH_USERNAME;
    const configPath = path.join(tempDir, 'config.json');
    const configWithToken = {
      ...createValidConfig(),
      ssh: {
        ...createValidConfig().ssh,
        username: 'ENV:SSH_USERNAME'
      }
    };

    await writeJsonFile(configPath, configWithToken);
    delete process.env.SSH_USERNAME;

    try {
      await expect(loadAppConfig({ configPath })).rejects.toThrow(
        /Config at .* references missing environment variable SSH_USERNAME at ssh\.username/
      );
    } finally {
      if (originalSshUsername === undefined) {
        delete process.env.SSH_USERNAME;
      } else {
        process.env.SSH_USERNAME = originalSshUsername;
      }
    }
  });
});
