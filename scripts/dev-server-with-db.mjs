import { spawn } from 'node:child_process';
import { resolveDevServerWatchCommand } from './dev-server-command.mjs';

try {
  process.loadEnvFile?.();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const composeFile = process.env.DEV_DB_COMPOSE_FILE ?? 'docker-compose.dev.yml';
const mode = process.env.DEV_DB_RESET_ON_STOP === '1' ? 'reset' : 'persist';

let shuttingDown = false;
let serverProcess;

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(command, args, {
      stdio: 'inherit',
      shell: false
    });

    processHandle.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });

    processHandle.on('error', reject);
  });
}

function buildDockerComposeArgs(action) {
  const baseArgs = ['-f', composeFile];

  if (action === 'up') {
    return [...baseArgs, 'up', '-d', '--wait', 'db'];
  }

  if (mode === 'reset') {
    return [...baseArgs, 'down', '--volumes'];
  }

  return [...baseArgs, 'down'];
}

async function shutdownDatabase() {
  const downArgs = buildDockerComposeArgs('down');

  try {
    await runCommand('docker', ['compose', ...downArgs]);
  } catch (error) {
    console.error('Failed to stop dev database:', error);
  }
}

async function runDatabaseMigrations() {
  await runCommand(resolveMigrationCommand().command, resolveMigrationCommand().args);
}

async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill(signal);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}

try {
  const upArgs = buildDockerComposeArgs('up');

  await runCommand('docker', ['compose', ...upArgs]);
  await runDatabaseMigrations();

  const devServerWatchCommand = resolveDevServerWatchCommand();

  serverProcess = spawn(devServerWatchCommand.command, devServerWatchCommand.args, {
    stdio: 'inherit',
    shell: false
  });

  serverProcess.on('exit', async (code) => {
    await shutdownDatabase();
    process.exit(code ?? 0);
  });

  serverProcess.on('error', async (error) => {
    console.error('Failed to start dev server:', error);
    await shutdownDatabase();
    process.exit(1);
  });
} catch (error) {
  console.error('Failed to start dev database:', error);
  await shutdownDatabase();
  process.exit(1);
}

function resolveMigrationCommand() {
  if (process.platform === 'win32') {
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
