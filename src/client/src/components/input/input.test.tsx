import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { Input } from './input';

function renderInput(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

const inputStylesPath = join(
  process.cwd(),
  'src/client/src/components/input/input.module.css'
);

describe('Input', () => {
  it('given an uncontrolled value when the user types then it updates the text', async () => {
    const user = userEvent.setup();

    renderInput(<Input defaultValue="123" label="Seed" />);

    const input = screen.getByRole('textbox', { name: 'Seed' });

    await user.type(input, '45');

    expect(input).toHaveValue('12345');
  });

  it('given a disabled input then it forwards the disabled state', () => {
    renderInput(<Input disabled label="Seed" />);

    expect(screen.getByRole('textbox', { name: 'Seed' })).toBeDisabled();
  });

  it('given description and error text then it renders field guidance', () => {
    renderInput(
      <Input
        description="Use a fixed seed for repeatable results."
        error="Seed must be a positive number."
        label="Seed"
      />
    );

    const input = screen.getByRole('textbox', { name: 'Seed' });

    expect(input).toHaveAccessibleDescription(/Use a fixed seed/);
    expect(input).toHaveAccessibleDescription(/Seed must be a positive number/);
    expect(input).toBeInvalid();
  });

  it('given section content then the custom input styles add inset after Mantine sections', () => {
    const css = readFileSync(inputStylesPath, 'utf8');
    const inputRule = css.match(/\.input\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    expect(inputRule).toContain('padding-block');
    expect(inputRule).toContain('padding-inline');
    expect(inputRule).not.toContain('var(--input-left-section-size');
    expect(inputRule).not.toContain('var(--input-right-section-size');
    expect(css).toContain('.wrapper[data-with-left-section] .input');
    expect(css).toContain('.wrapper[data-with-right-section] .input');
    expect(inputRule).not.toMatch(/^\s*padding\s*:/m);
  });
});
