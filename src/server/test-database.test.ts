// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();
const queryMock = vi.fn();
const endMock = vi.fn();

vi.mock('pg', () => ({
  Client: vi.fn(function MockClient() {
    return {
      connect: connectMock,
      query: queryMock,
      end: endMock
    };
  })
}));

describe('createTestDatabaseContext', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/fuzzy-guacamole';
    connectMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset();
    endMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  test('given_schema_creation_failure_when_creating_context_then_admin_client_is_closed', async () => {
    queryMock.mockRejectedValueOnce(new Error('schema creation failed'));

    const { createTestDatabaseContext } = await import('./test-database.js');

    await expect(createTestDatabaseContext()).rejects.toThrow(
      'schema creation failed'
    );
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
