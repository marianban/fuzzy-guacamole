import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComfyDeckTheme } from '#root/styles/comfy-deck-theme';

import { ControlPanelFooter } from './control-panel-footer';
import styles from './control-panel-footer.module.css';

function renderControlPanelFooter(
  props: React.ComponentProps<typeof ControlPanelFooter> = {}
) {
  return render(
    <ComfyDeckTheme>
      <ControlPanelFooter {...props} />
    </ComfyDeckTheme>
  );
}

describe('ControlPanelFooter', () => {
  it('given action handlers when a user presses the footer actions then it invokes them', async () => {
    const user = userEvent.setup();
    const handleRun = vi.fn();
    const handleDelete = vi.fn();

    renderControlPanelFooter({ onDelete: handleDelete, onRun: handleRun });

    await user.click(screen.getByRole('button', { name: 'Rerun' }));
    await user.click(screen.getByRole('button', { name: 'Delete generation' }));

    const deleteButton = screen.getByRole('button', { name: 'Delete generation' });
    const runButton = screen.getByRole('button', { name: 'Rerun' });

    expect(handleRun).toHaveBeenCalledTimes(1);
    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(runButton).not.toHaveClass(styles.runButton as string);
    expect(deleteButton).not.toHaveClass(styles.runButton as string);
    expect(deleteButton).not.toHaveTextContent('Rerun');
  });

  it('given the footer when rendered then it shows the diagnostics region', () => {
    renderControlPanelFooter();

    expect(screen.getByRole('log', { name: 'Diagnostics' })).toBeInTheDocument();
  });
});
