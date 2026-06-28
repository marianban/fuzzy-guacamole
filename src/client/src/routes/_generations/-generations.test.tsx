import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiQueryProvider } from '#root/api/query-provider';
import { ComfyDeckTheme } from '#root/styles/comfy-deck-theme';
import styles from './generations.module.css';
import { GenerationsPage } from './generations';

const canvasClassName = styles.canvas ?? '';
const sidePanelClassName = styles.sidePanel ?? '';

describe('GenerationsPage', () => {
  it('given the generations route when rendered then it provides canvas controls and footer regions', () => {
    render(
      <ComfyDeckTheme>
        <ApiQueryProvider>
          <GenerationsPage />
        </ApiQueryProvider>
      </ComfyDeckTheme>
    );

    expect(screen.getByTestId('generation-canvas')).toHaveClass(canvasClassName);
    expect(screen.getByRole('complementary')).toHaveClass(sidePanelClassName);
    expect(
      screen.getByRole('contentinfo', { name: 'Generation history' })
    ).toBeInTheDocument();
  });
});
