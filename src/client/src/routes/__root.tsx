import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import { ComfyDeckTheme } from '../styles/comfy-deck-theme';
import '../styles/theme.css';
import { Shell } from '../layout/shell/shell';
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
      <TanStackDevtools
        config={{
          position: 'bottom-right'
        }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />
          }
        ]}
      />
    </ComfyDeckTheme>
  );
}
