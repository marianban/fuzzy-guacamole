import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { SidePanel } from './side-panel';
import styles from './side-panel.module.css';

const contentClassName = styles.content ?? '';
const footerClassName = styles.footer ?? '';

function renderSidePanel(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('SidePanel', () => {
  it('given title content and footer nodes when rendered then it places each node in the panel slots', () => {
    renderSidePanel(
      <SidePanel
        title={<span>Control Panel</span>}
        content={<button type="button">Prompt settings</button>}
        footer={<button type="button">Rerun</button>}
      />
    );

    expect(
      screen.getByRole('complementary', { name: 'Control Panel' })
    ).toBeInTheDocument();
    expect(screen.getByText('Control Panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompt settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument();
  });

  it('given long content when rendered then the content slot is the scrollable grow region', () => {
    renderSidePanel(
      <SidePanel
        title="Control Panel"
        content={<div>Many controls</div>}
        footer={<div>Actions</div>}
      />
    );

    expect(screen.getByTestId('side-panel-content')).toHaveClass(contentClassName);
  });

  it('given footer content when rendered then the footer slot clips overflow', () => {
    renderSidePanel(
      <SidePanel
        title="Control Panel"
        content={<div>Controls</div>}
        footer={<div>Actions and logs</div>}
      />
    );

    expect(screen.getByTestId('side-panel-footer')).toHaveClass(footerClassName);
  });
});
