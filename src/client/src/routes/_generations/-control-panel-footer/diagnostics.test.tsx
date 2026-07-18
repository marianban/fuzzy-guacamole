import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComfyDeckTheme } from '#root/styles/comfy-deck-theme';

import { Diagnostics } from './diagnostics';

describe('Diagnostics', () => {
  it('given mock diagnostics when rendered then it shows info, warning, and error messages', () => {
    render(
      <ComfyDeckTheme>
        <Diagnostics />
      </ComfyDeckTheme>
    );

    const diagnostics = screen.getByRole('log', { name: 'Diagnostics' });

    expect(within(diagnostics).getByText('INFO')).toBeInTheDocument();
    expect(within(diagnostics).getByText('WARN')).toBeInTheDocument();
    expect(within(diagnostics).getByText('ERROR')).toBeInTheDocument();
    expect(within(diagnostics).getByText('Initializing workflow...')).toBeInTheDocument();
  });

  it('given a long diagnostic message when rendered then it exposes the full text in a tooltip', () => {
    const longMessage =
      'The preview output could not be loaded because the remote worker returned an incomplete response.';

    render(
      <ComfyDeckTheme>
        <Diagnostics
          messages={[
            {
              id: 'long-message',
              message: longMessage,
              timestamp: '12:00:05',
              type: 'error'
            }
          ]}
        />
      </ComfyDeckTheme>
    );

    const messageGroup = screen.getByTitle(longMessage);

    expect(within(messageGroup).getByText('12:00:05')).toBeInTheDocument();
    expect(within(messageGroup).getByText('ERROR')).toBeInTheDocument();
    expect(within(messageGroup).getByText(longMessage)).toBeInTheDocument();
  });
});
