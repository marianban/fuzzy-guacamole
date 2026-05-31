import type { Preview } from '@storybook/tanstack-react';
import { initialize, mswLoader } from 'msw-storybook-addon';

import { ComfyDeckTheme } from '../src/client/src/styles/comfy-deck-theme';
import '../src/client/src/styles/theme.css';

import { mswHandlers } from './msw-handlers';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  decorators: [
    (Story) => (
      <ComfyDeckTheme>
        <Story />
      </ComfyDeckTheme>
    )
  ],
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
