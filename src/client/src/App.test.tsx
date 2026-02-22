import { render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

describe('App', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              state: 'Online',
              since: '2026-01-01T00:00:00.000Z'
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          )
      )
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('given_status_api_when_app_renders_then_online_state_is_visible', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', {
        name: 'Comfy Frontend Orchestrator'
      })
    ).toBeInTheDocument();
    expect(await screen.findByText('Online')).toBeInTheDocument();
  });
});
