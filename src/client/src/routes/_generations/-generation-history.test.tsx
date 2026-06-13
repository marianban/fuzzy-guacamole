import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GenerationHistory } from './-generation-history';

describe('GenerationHistory', () => {
  it('given no generations when rendered then it shows the empty history state', () => {
    render(<GenerationHistory />);

    expect(
      screen.getByRole('contentinfo', { name: 'Generation history' })
    ).toBeInTheDocument();
    expect(screen.getByText('Recent history')).toBeInTheDocument();
    expect(screen.getByText('0 Total Generations')).toBeInTheDocument();
    expect(screen.getByText('Gallery is currently empty')).toBeInTheDocument();
    expect(
      screen.getByText('Start a new generation to build your project library')
    ).toBeInTheDocument();
  });
});
