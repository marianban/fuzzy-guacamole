import { describe, expect, it } from 'vitest';

import { appStatusResponseSchema } from './status.js';

describe('appStatusResponseSchema', () => {
  it('given_startup_failed_status_when_last_error_is_present_then_schema_accepts_it', () => {
    const parsed = appStatusResponseSchema.parse({
      state: 'StartupFailed',
      since: '2026-04-11T10:00:00.000Z',
      lastError: 'connection refused'
    });

    expect(parsed).toEqual({
      state: 'StartupFailed',
      since: '2026-04-11T10:00:00.000Z',
      lastError: 'connection refused'
    });
  });

  it('given_online_status_when_last_error_is_present_then_schema_rejects_it', () => {
    const result = appStatusResponseSchema.safeParse({
      state: 'Online',
      since: '2026-04-11T10:00:00.000Z',
      lastError: 'stale error'
    });

    expect(result.success).toBe(false);
  });

  it('given_offline_status_when_comfy_details_are_present_then_schema_rejects_it', () => {
    const result = appStatusResponseSchema.safeParse({
      state: 'Offline',
      since: '2026-04-11T10:00:00.000Z',
      comfy: {
        devices: []
      }
    });

    expect(result.success).toBe(false);
  });
});
