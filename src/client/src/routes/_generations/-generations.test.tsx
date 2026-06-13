import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import styles from './generations.module.css';
import { GenerationsPage } from './generations';

const canvasClassName = styles.canvas ?? '';
const sidePanelClassName = styles.sidePanel ?? '';

describe('GenerationsPage', () => {
  it('given the generations route when rendered then it provides canvas controls and footer regions', () => {
    render(<GenerationsPage />);

    expect(screen.getByTestId('generation-canvas')).toHaveClass(canvasClassName);
    expect(screen.getByRole('complementary')).toHaveClass(sidePanelClassName);
    expect(
      screen.getByRole('contentinfo', { name: 'Generation history' })
    ).toBeInTheDocument();
  });
});
