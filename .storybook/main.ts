import type { StorybookConfig } from '@storybook/tanstack-react';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  staticDirs: ['../public'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp'
  ],
  framework: '@storybook/tanstack-react',
  viteFinal: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      dedupe: ['react', 'react-dom']
    }
  })
};
export default config;
