import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { TextArea } from './text-area';

function renderTextArea(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('TextArea', () => {
  it('given an uncontrolled value when the user types then it updates the text', async () => {
    const user = userEvent.setup();

    renderTextArea(<TextArea aria-label="Prompt" defaultValue="Modernist villa" />);

    const textArea = screen.getByRole('textbox', { name: 'Prompt' });

    await user.type(textArea, ' in a forest');

    expect(textArea).toHaveValue('Modernist villa in a forest');
  });

  it('given a disabled textarea then it forwards the disabled state', () => {
    renderTextArea(<TextArea aria-label="Prompt" disabled />);

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeDisabled();
  });

  it('given the default textarea then it does not expose Radix wrapper classes', () => {
    renderTextArea(<TextArea aria-label="Prompt" />);

    const textArea = screen.getByRole('textbox', { name: 'Prompt' });

    expect(textArea.closest('.rt-TextAreaRoot')).toBeNull();
  });
});
