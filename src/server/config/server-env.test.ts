import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { loadServerEnv, parseServerEnv } from './server-env.js';

describe('server environment', () => {
  test('given_all_required_variables_when_parsed_then_returns_typed_config', () => {
    expect(parseServerEnv(createValidServerEnv())).toEqual({
      CONFIG_PATH: './data/config.json',
      DATABASE_URL: 'postgres://example.test/fuzzy-guacamole',
      HOST: '0.0.0.0',
      LOG_FILE_PATH: './data/logs/backend.log',
      LOG_LEVEL: 'info',
      PORT: 3000
    });
  });

  test('given_numeric_port_when_parsed_then_coerces_it', () => {
    expect(
      parseServerEnv({
        ...createValidServerEnv(),
        PORT: '8080'
      }).PORT
    ).toBe(8080);
  });

  test('given_missing_required_variable_when_parsed_then_throws', () => {
    expect(() =>
      parseServerEnv({
        ...createValidServerEnv(),
        DATABASE_URL: undefined
      })
    ).toThrow(/DATABASE_URL/);
  });

  test('given_missing_previously_defaulted_variable_when_parsed_then_throws', () => {
    expect(() =>
      parseServerEnv({
        ...createValidServerEnv(),
        HOST: undefined
      })
    ).toThrow(/HOST/);
  });

  test('given_invalid_port_when_parsed_then_throws', () => {
    expect(() =>
      parseServerEnv({
        ...createValidServerEnv(),
        PORT: '70000'
      })
    ).toThrow(/PORT/);
  });

  test('given_dotenv_tokens_when_loaded_then_exposes_them_to_app_config_resolution', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'fg-server-env-'));
    const dotenvPath = path.join(tempDir, '.env');
    const tokenName = 'FG_SERVER_ENV_TOKEN_TEST';
    const originalConfigPath = process.env.CONFIG_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    await writeFile(
      dotenvPath,
      [
        'CONFIG_PATH=./data/config.json',
        'DATABASE_URL=postgres://example.test/fuzzy-guacamole',
        'HOST=0.0.0.0',
        'PORT=3000',
        'LOG_LEVEL=info',
        'LOG_FILE_PATH=./data/logs/backend.log',
        `${tokenName}=resolved-secret`
      ].join('\n')
    );

    try {
      loadServerEnv(dotenvPath);

      expect(process.env[tokenName]).toBe('resolved-secret');
    } finally {
      Reflect.deleteProperty(process.env, tokenName);
      restoreEnv('CONFIG_PATH', originalConfigPath);
      restoreEnv('DATABASE_URL', originalDatabaseUrl);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createValidServerEnv(): Record<string, string> {
  return {
    CONFIG_PATH: './data/config.json',
    DATABASE_URL: 'postgres://example.test/fuzzy-guacamole',
    HOST: '0.0.0.0',
    LOG_FILE_PATH: './data/logs/backend.log',
    LOG_LEVEL: 'info',
    PORT: '3000'
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  process.env[name] = value;
}
