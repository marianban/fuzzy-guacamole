import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions } from '@testing-library/react';

import { routeTree } from '../routeTree.gen';
import { ComfyDeckTheme } from '../styles/comfy-deck-theme';

interface RenderAppOptions extends Omit<RenderOptions, 'wrapper'> {
  initialLocation?: string;
}

export function renderApp(
  ui: ReactElement,
  { initialLocation = '/', ...renderOptions }: RenderAppOptions = {}
) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialLocation] })
  });

  function AppProviders({ children }: { children: ReactNode }) {
    return (
      <RouterContextProvider router={router}>
        <ComfyDeckTheme>{children}</ComfyDeckTheme>
      </RouterContextProvider>
    );
  }

  return {
    ...render(ui, { wrapper: AppProviders, ...renderOptions }),
    router
  };
}
