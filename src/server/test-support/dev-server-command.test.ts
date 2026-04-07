// @vitest-environment node

import { describe, expect, test } from 'vitest';

interface DevServerWatchCommand {
  command: string;
  args: string[];
}

const { resolveDevServerWatchCommand } = (await import(
  // @ts-expect-error The helper script is plain .mjs; the expected shape is declared inline in this test.
  '../../../scripts/dev-server-command.mjs'
)) as {
  resolveDevServerWatchCommand: (platform?: string) => DevServerWatchCommand;
};

describe('resolveDevServerWatchCommand', () => {
  test('given_win32_platform_when_resolving_command_then_it_uses_cmd_exe_to_run_npm_cmd', () => {
    const result = resolveDevServerWatchCommand('win32');

    expect(result).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev:server:watch']
    });
  });

  test('given_non_windows_platform_when_resolving_command_then_it_uses_npm_directly', () => {
    const result = resolveDevServerWatchCommand('linux');

    expect(result).toEqual({
      command: 'npm',
      args: ['run', 'dev:server:watch']
    });
  });
});
