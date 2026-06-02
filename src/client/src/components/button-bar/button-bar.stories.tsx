import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ButtonBar } from './button-bar';

const data = [
  { label: 'Auto', value: 'auto' },
  { label: 'Manual', value: 'manual' }
];

const meta = {
  title: 'Components/ButtonBar',
  component: ButtonBar,
  args: {
    'aria-label': 'Generation mode',
    data
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof ButtonBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Auto: Story = {
  args: {
    defaultValue: 'auto'
  }
};

export const Manual: Story = {
  args: {
    defaultValue: 'manual'
  }
};

export const Disabled: Story = {
  args: {
    defaultValue: 'auto',
    disabled: true
  }
};
