import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { Slider, type SliderProps } from './slider';

function renderSlider(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('Slider', () => {
  it('given slider props when typed then they require a controlled value and reject defaultValue', () => {
    expectTypeOf<SliderProps['value']>().toEqualTypeOf<number>();
    expectTypeOf<
      'defaultValue' extends keyof SliderProps ? true : false
    >().toEqualTypeOf<false>();
  });

  it('given a label and value when rendered then it exposes the current value next to the label', () => {
    renderSlider(
      <Slider aria-label="Steps" value={50} label="Steps" min={1} max={100} />
    );

    expect(screen.getByText('Steps')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();

    const slider = screen.getByRole('slider', { name: 'Steps' });

    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  it('given a controlled slider when the user presses ArrowRight then it requests the next value without mutating the rendered value', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    renderSlider(
      <Slider
        aria-label="Steps"
        label="Steps"
        max={100}
        min={1}
        onChange={handleChange}
        value={50}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Steps' });

    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(handleChange).toHaveBeenLastCalledWith(51);
  });

  it('given a disabled slider then it forwards the disabled state', () => {
    renderSlider(
      <Slider aria-label="Steps" label="Steps" max={100} disabled min={1} value={50} />
    );

    expect(screen.getByRole('slider', { name: 'Steps' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
