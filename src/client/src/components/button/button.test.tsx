import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { Button } from './button';

function renderButton(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('Button', () => {
  it('given a click handler when the user presses the button then it forwards the click', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderButton(<Button onClick={handleClick}>Generate</Button>);

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('given a disabled button when rendered then it forwards the disabled state', () => {
    renderButton(<Button disabled>Generate</Button>);

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('given left and right sections when rendered then it shows the provided icons', () => {
    renderButton(
      <Button
        leftSection={<Play aria-hidden="true" data-testid="left-icon" size={16} />}
        rightSection={<Play aria-hidden="true" data-testid="right-icon" size={16} />}
      >
        Generate
      </Button>
    );

    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });
});
