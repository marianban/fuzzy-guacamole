// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { buildDockerComposeArgs, resolveDevDatabaseMode } from '../dev-database.js';

describe('resolveDevDatabaseMode', () => {
  it('given_no_env_toggle_when_resolving_mode_then_defaults_to_persist', () => {
    const mode = resolveDevDatabaseMode({});
    expect(mode).toBe('persist');
  });

  it('given_reset_toggle_enabled_when_resolving_mode_then_returns_reset', () => {
    const mode = resolveDevDatabaseMode({ DEV_DB_RESET_ON_STOP: '1' });
    expect(mode).toBe('reset');
  });
});

describe('buildDockerComposeArgs', () => {
  it('given_up_action_when_building_args_then_targets_dev_compose_db_service', () => {
    const args = buildDockerComposeArgs({
      action: 'up',
      composeFile: 'docker-compose.dev.yml',
      mode: 'persist'
    });

    expect(args).toEqual([
      '-f',
      'docker-compose.dev.yml',
      'up',
      '-d',
      '--wait',
      'db'
    ]);
  });

  it('given_persist_mode_on_shutdown_when_building_args_then_does_not_remove_volume', () => {
    const args = buildDockerComposeArgs({
      action: 'down',
      composeFile: 'docker-compose.dev.yml',
      mode: 'persist'
    });

    expect(args).toEqual(['-f', 'docker-compose.dev.yml', 'down']);
  });

  it('given_reset_mode_on_shutdown_when_building_args_then_removes_volume', () => {
    const args = buildDockerComposeArgs({
      action: 'down',
      composeFile: 'docker-compose.dev.yml',
      mode: 'reset'
    });

    expect(args).toEqual(['-f', 'docker-compose.dev.yml', 'down', '--volumes']);
  });
});
