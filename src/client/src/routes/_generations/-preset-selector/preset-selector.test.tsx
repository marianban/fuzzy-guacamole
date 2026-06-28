import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PresetSelector } from './preset-selector';

describe('PresetSelector', () => {
  it('given preset props when rendered then it shows the current preset with the configured label', () => {
    render(<PresetSelector label="Preset Selector" presetId="txt2img-ernie/basic" />);

    const selector = screen.getByRole('button', { name: 'Preset Selector' });

    expect(selector).toHaveTextContent('Cinematic Exterior');
    expect(selector).toHaveAttribute('data-preset-id', 'txt2img-ernie/basic');
  });
});
