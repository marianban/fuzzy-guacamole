import { describe, expect, test } from 'vitest';

import { parseClientEnv } from './client-env';

describe('client environment', () => {
  test('given_vite_variables_when_parsed_then_returns_typed_proxy_config', () => {
    expect(
      parseClientEnv({
        VITE_HOST: '127.0.0.1',
        VITE_PORT: '3000'
      })
    ).toEqual({
      VITE_HOST: '127.0.0.1',
      VITE_PORT: 3000
    });
  });

  test('given_non_vite_variables_when_parsed_then_excludes_them', () => {
    expect(
      parseClientEnv({
        DATABASE_URL: 'postgres://secret',
        VITE_HOST: '127.0.0.1',
        VITE_PORT: '3000'
      })
    ).not.toHaveProperty('DATABASE_URL');
  });

  test('given_invalid_vite_port_when_parsed_then_throws', () => {
    expect(() =>
      parseClientEnv({
        VITE_HOST: '127.0.0.1',
        VITE_PORT: '70000'
      })
    ).toThrow(/VITE_PORT/);
  });
});
