// @vitest-environment node

import { Client as PostgresClient } from 'pg';
import { describe, expect, test } from 'vitest';

import { requireTestEnvVar } from './test-env.js';

const clientBaseUrl = requireTestEnvVar('CLIENT_BASE_URL');
const apiBaseUrl = requireTestEnvVar('API_BASE_URL');
const comfyBaseUrl = requireTestEnvVar('COMFY_BASE_URL');
const databaseUrl = requireTestEnvVar('DATABASE_URL');

describe.sequential('e2e preflight', () => {
  test('given_e2e_run_when_checking_client_then_client_is_running', async () => {
    const response = await fetchWithTimeout(`${clientBaseUrl}/`, 5_000, 'client');

    if (!response.ok) {
      throw new Error(
        `Client is reachable but returned ${response.status}. ` +
          'Please run the client before e2e tests: `npm run dev:client`.'
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/html');
  });

  test('given_e2e_run_when_checking_api_server_then_server_is_running', async () => {
    const response = await fetchWithTimeout(
      `${apiBaseUrl}/healthz`,
      5_000,
      'API server'
    );

    if (!response.ok) {
      throw new Error(
        `API server is reachable but returned ${response.status}. ` +
          'Please run the server before e2e tests: `npm run dev:server`.'
      );
    }

    const payload = (await response.json()) as { ok?: boolean };
    expect(payload.ok).toBe(true);
  });

  test('given_e2e_run_when_checking_comfyui_then_comfyui_is_running', async () => {
    const response = await fetchWithTimeout(
      `${comfyBaseUrl}/api/system_stats`,
      5_000,
      'ComfyUI'
    );

    if (!response.ok) {
      throw new Error(
        `ComfyUI is reachable but returned ${response.status}. ` +
          `Please run ComfyUI at ${comfyBaseUrl} before e2e tests.`
      );
    }

    const payload = (await response.json()) as {
      system?: unknown;
      devices?: unknown[];
    };
    expect(payload.system).toBeDefined();
    expect(Array.isArray(payload.devices)).toBe(true);
  });

  test('given_e2e_run_when_checking_database_then_database_is_running', async () => {
    const client = new PostgresClient({ connectionString: databaseUrl });

    try {
      await client.connect();
      const result = await client.query<{ ready: number }>('select 1 as ready');
      expect(result.rows[0]?.ready).toBe(1);
    } catch (error) {
      throw new Error(
        `Database is not reachable at ${redactPassword(databaseUrl)}. ` +
          'Please run the database before e2e tests: ' +
          '`docker compose -f docker-compose.dev.yml up -d --wait db` or `npm run dev:server`. ' +
          `Connection error: ${toErrorMessage(error)}`
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  });
});

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  serviceName: string
): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Error(
      `${serviceName} is not reachable at ${url}. ` +
        `Please start it before e2e tests. Connection error: ${toErrorMessage(error)}`
    );
  }
}

function redactPassword(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password.length > 0) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
