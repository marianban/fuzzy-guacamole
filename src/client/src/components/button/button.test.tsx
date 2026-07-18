import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { Button } from './button';
import styles from './button.module.css';

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

  it('given an unstyled variant when rendered then it omits the themed button chrome class', () => {
    renderButton(<Button variant="unstyled">Toolbar action</Button>);

    expect(screen.getByRole('button', { name: 'Toolbar action' })).not.toHaveClass(
      styles.button as string
    );
  });

  it('given the default variant when rendered then it exposes the gradient through Mantine button variables', () => {
    renderButton(<Button>Generate</Button>);

    const button = screen.getByRole('button', { name: 'Generate' });

    expect(button).toHaveClass(styles.button as string);
    expect(getComputedStyle(button).getPropertyValue('--button-bg')).toContain(
      'linear-gradient'
    );
  });
});
