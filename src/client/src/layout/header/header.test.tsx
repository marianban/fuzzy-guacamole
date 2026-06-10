import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { ActionTools } from './action-tools';
import { Header } from './header';
import { HeaderHardwareInfo } from './header-hardware-info';
import { HeaderGlobalStatus } from './header-global-status';
import { HeaderLogo } from './header-logo';
import { Navigation } from './navigation';

function renderHeader(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('Header', () => {
  it('given default props when rendered then it shows logo menu action tools and mocked status widgets', () => {
    renderHeader(<Header />);

    expect(screen.getByRole('heading', { name: /ComfyStar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Generations/i })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Split view' })).toBeInTheDocument();
    expect(screen.getByText('NVIDIA RTX 4090')).toBeInTheDocument();
    expect(screen.getByText('18.2 / 24GB')).toBeInTheDocument();
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
  });

  it('given custom hardware props when rendered then hardware widget shows provided values', () => {
    renderHeader(
      <HeaderHardwareInfo
        label="Apple M3 Max"
        detail="42% / 128GB"
        utilizationPercent={42}
      />
    );

    expect(screen.getByText('Apple M3 Max')).toBeInTheDocument();
    expect(screen.getByText('42% / 128GB')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Hardware utilization' })
    ).toHaveAttribute('aria-valuenow', '42');
  });

  it('given custom global status props when rendered then global status widget shows provided label', () => {
    renderHeader(<HeaderGlobalStatus label="DEGRADED" tone="warning" />);

    expect(screen.getByText('DEGRADED')).toBeInTheDocument();
  });

  it('given navigation when rendered then it shows the primary generations link', () => {
    renderHeader(<Navigation />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /ComfyStar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Generations/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('given header logo when rendered then it shows the standalone brand heading', () => {
    renderHeader(<HeaderLogo />);

    expect(screen.getByRole('heading', { name: /ComfyStar/i })).toBeInTheDocument();
  });

  it('given action tools when rendered then it shows the available toolbar buttons', () => {
    renderHeader(<ActionTools />);

    expect(screen.getByRole('toolbar', { name: 'Action tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Split view' })).toBeInTheDocument();
  });
});
