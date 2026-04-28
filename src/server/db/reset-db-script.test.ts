// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { buildResetDatabasePlan, resolveMigrationCommand } from './reset-database.js';

describe('resolveMigrationCommand', () => {
  it('given_windows_platform_when_resolving_migration_command_then_uses_npm_cmd', () => {
    expect(resolveMigrationCommand('win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'db:migrate']
    });
  });

  it('given_non_windows_platform_when_resolving_migration_command_then_uses_npm', () => {
    expect(resolveMigrationCommand('linux')).toEqual({
      command: 'npm',
      args: ['run', 'db:migrate']
    });
  });
});

describe('buildResetDatabasePlan', () => {
  it('given_dev_compose_file_when_building_reset_plan_then_volume_is_removed_and_database_is_recreated', () => {
    expect(
      buildResetDatabasePlan({
        composeFile: 'docker-compose.dev.yml',
        platform: 'linux'
      })
    ).toEqual([
      {
        command: 'docker',
        args: ['compose', '-f', 'docker-compose.dev.yml', 'down', '--volumes']
      },
      {
        command: 'docker',
        args: ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait', 'db']
      },
      {
        command: 'npm',
        args: ['run', 'db:migrate']
      }
    ]);
  });
});
