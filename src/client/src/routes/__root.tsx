import { Outlet, createRootRoute } from '@tanstack/react-router';

import { ComfyDeckTheme } from '#root/styles/comfy-deck-theme';
import { Shell } from '#root/layout/shell/shell';
import '../styles/theme.css';
import { Link } from 'lucide-react';

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    );
  }
});

function RootComponent() {
  return (
    <ComfyDeckTheme>
      <Shell>
        <Outlet />
      </Shell>
    </ComfyDeckTheme>
  );
}
