// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { buildServer } from './app.js';

describe('openapi documentation', () => {
  it('given_server_when_requesting_openapi_json_then_contains_api_endpoints', async () => {
    const app = buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/openapi/json'
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(payload.openapi).toMatch(/^3\./);
    expect(payload.paths).toMatchObject({
      '/healthz': expect.any(Object),
      '/api/status': expect.any(Object),
      '/api/presets': expect.any(Object),
      '/api/presets/{*}': expect.any(Object)
    });

    await app.close();
  });
});
