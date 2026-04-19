import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDockerComposeArgs } from '../src/server/db/dev-database.js';

try {
  process.loadEnvFile?.();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

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

export async function resetDatabase(options: { composeFile: string }): Promise<void> {
  for (const step of buildResetDatabasePlan(options)) {
    await runCommand(step);
  }
}

async function runCommand(step: CommandSpec): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const processHandle = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: false
    });

    processHandle.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${step.command} ${step.args.join(' ')} exited with code ${code ?? 'unknown'}`
        )
      );
    });

    processHandle.on('error', reject);
  });
}

const entryFilePath = process.argv[1];
const isMain =
  entryFilePath !== undefined &&
  path.resolve(entryFilePath) === fileURLToPath(import.meta.url);

if (isMain) {
  const composeFile = process.env.DEV_DB_COMPOSE_FILE ?? 'docker-compose.dev.yml';

  try {
    await resetDatabase({ composeFile });
  } catch (error) {
    console.error('Failed to reset dev database:', error);
    process.exit(1);
  }
}
