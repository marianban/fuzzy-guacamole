import { Link } from '@tanstack/react-router';
import { useMantineTheme } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from './render-app';

function ThemeProbe() {
  const theme = useMantineTheme();

  return <span>{theme.primaryColor}</span>;
}

describe('renderApp', () => {
  it('given app UI when rendered then it provides the theme and router', () => {
    const { router } = renderApp(
      <>
        <ThemeProbe />
        <Link to="/generations">Generations</Link>
      </>,
      { initialLocation: '/generations' }
    );

    expect(screen.getByText('lime')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Generations' })).toHaveAttribute(
      'href',
      '/generations'
    );
    expect(router.history.location.pathname).toBe('/generations');
  });
});
