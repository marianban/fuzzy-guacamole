import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { ButtonBar } from './button-bar';

function renderButtonBar(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('ButtonBar', () => {
  it('given a default value when the user switches options then it updates the selected item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    renderButtonBar(
      <ButtonBar
        aria-label="Generation mode"
        data={[
          { label: 'Auto', value: 'auto' },
          { label: 'Manual', value: 'manual' }
        ]}
        defaultValue="auto"
        onChange={handleChange}
      />
    );

    const group = screen.getByRole('radiogroup', { name: 'Generation mode' });
    const auto = screen.getByRole('radio', { name: 'Auto' });
    const manual = screen.getByRole('radio', { name: 'Manual' });

    expect(group).toBeInTheDocument();
    expect(auto).toBeChecked();
    expect(manual).not.toBeChecked();

    await user.click(manual);

    expect(manual).toBeChecked();
    expect(handleChange).toHaveBeenCalledWith('manual');
  });

  it('given a disabled button bar then it forwards the disabled state to each segment', () => {
    renderButtonBar(
      <ButtonBar
        aria-label="Generation mode"
        data={[
          { label: 'Auto', value: 'auto' },
          { label: 'Manual', value: 'manual' }
        ]}
        defaultValue="auto"
        disabled
      />
    );

    expect(screen.getByRole('radio', { name: 'Auto' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeDisabled();
  });
});
