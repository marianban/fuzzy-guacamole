export function resolveDevServerWatchCommand(platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev:server:watch']
    };
  }

  return {
    command: 'npm',
    args: ['run', 'dev:server:watch']
  };
}
