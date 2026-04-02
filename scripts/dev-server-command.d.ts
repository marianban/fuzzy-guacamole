export interface DevServerWatchCommand {
  command: string;
  args: string[];
}

export function resolveDevServerWatchCommand(
  platform?: string
): DevServerWatchCommand;
