import { buildDockerComposeArgs } from './dev-database.js';

export interface CommandSpec {
  command: string;
  args: string[];
}

export function resolveMigrationCommand(
  platform: NodeJS.Platform = process.platform
): CommandSpec {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'db:migrate']
    };
  }

  return {
    command: 'npm',
    args: ['run', 'db:migrate']
  };
}

export function buildResetDatabasePlan(options: {
  composeFile: string;
  platform?: NodeJS.Platform;
}): CommandSpec[] {
  return [
    {
      command: 'docker',
      args: [
        'compose',
        ...buildDockerComposeArgs({
          action: 'down',
          composeFile: options.composeFile,
          mode: 'reset'
        })
      ]
    },
    {
      command: 'docker',
      args: [
        'compose',
        ...buildDockerComposeArgs({
          action: 'up',
          composeFile: options.composeFile,
          mode: 'persist'
        })
      ]
    },
    resolveMigrationCommand(options.platform)
  ];
}
