export type DevDatabaseMode = 'persist' | 'reset';
export type DevDatabaseAction = 'up' | 'down';

interface BuildDockerComposeArgsOptions {
  action: DevDatabaseAction;
  composeFile: string;
  mode: DevDatabaseMode;
}

export function resolveDevDatabaseMode(
  env: Record<string, string | undefined>
): DevDatabaseMode {
  return env.DEV_DB_RESET_ON_STOP === '1' ? 'reset' : 'persist';
}

export function buildDockerComposeArgs(
  options: BuildDockerComposeArgsOptions
): string[] {
  const baseArgs = ['-f', options.composeFile];

  if (options.action === 'up') {
    return [...baseArgs, 'up', '-d', '--wait', 'db'];
  }

  if (options.mode === 'reset') {
    return [...baseArgs, 'down', '--volumes'];
  }

  return [...baseArgs, 'down'];
}
