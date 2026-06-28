import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { PresetSelector } from './preset-selector';

const meta = {
  title: 'Routes/Generations/PresetSelector',
  component: PresetSelector,
  args: {
    label: 'Preset Selector',
    presetId: 'txt2img-ernie/basic'
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof PresetSelector>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '180px' }}>
        <Story />
      </div>
    )
  ]
};
