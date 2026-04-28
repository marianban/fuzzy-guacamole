import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAppConfig } from '../config/app-config.js';

export async function loadTestConfig(root: string) {
  const configPath = path.join(root, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        comfyBaseUrl: 'http://127.0.0.1:8188',
        ssh: {
          host: '127.0.0.1',
          port: 22,
          username: 'user',
          privateKeyPath: '/tmp/id'
        },
        remoteStart: {
          startComfyCommand: 'echo start'
        },
        wol: {
          mac: 'AA:BB:CC:DD:EE:FF',
          broadcast: '192.168.0.255',
          port: 9
        },
        paths: {
          presets: '/tmp/presets',
          inputs: root,
          outputs: '/tmp/outputs'
        },
        timeouts: {
          pcBootMs: 1_000,
          sshPollMs: 1_000,
          comfyBootMs: 1_000,
          healthPollMs: 1_000,
          historyPollMs: 1_000,
          submittedTimeoutMs: 900_000
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}

export async function loadExecutionTestConfig(root: string) {
  const configPath = path.join(root, 'config.json');
  const inputsDir = path.join(root, 'inputs');
  const outputsDir = path.join(root, 'outputs');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        comfyBaseUrl: 'http://127.0.0.1:8188',
        ssh: {
          host: '127.0.0.1',
          port: 22,
          username: 'user',
          privateKeyPath: '/tmp/id'
        },
        remoteStart: {
          startComfyCommand: 'echo start'
        },
        wol: {
          mac: 'AA:BB:CC:DD:EE:FF',
          broadcast: '192.168.0.255',
          port: 9
        },
        paths: {
          presets: '/tmp/presets',
          inputs: inputsDir,
          outputs: outputsDir
        },
        timeouts: {
          pcBootMs: 1_000,
          sshPollMs: 1_000,
          comfyBootMs: 1_000,
          healthPollMs: 1_000,
          historyPollMs: 10,
          submittedTimeoutMs: 900_000
        }
      },
      null,
      2
    ),
    'utf8'
  );

  return loadAppConfig({ configPath });
}
