import type { Preview } from '@storybook/tanstack-react';
import { initialize, mswLoader } from 'msw-storybook-addon';

import '../src/client/src/styles.css';

import { mswHandlers } from './msw-handlers';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    msw: {
      handlers: mswHandlers
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  }
};

export default preview;
