import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Accordion } from './accordion';

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  args: {
    items: [
      {
        value: 'advanced',
        label: 'Advanced Parameters',
        content:
          'Fine tune steps, CFG, seed mode, and other generation controls before queueing.'
      }
    ]
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px', padding: '16px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
  args: {
    defaultValue: 'advanced'
  }
};

export const Multiple: Story = {
  args: {
    multiple: true,
    defaultValue: ['advanced', 'logs'],
    items: [
      {
        value: 'advanced',
        label: 'Advanced Parameters',
        content: 'Fine tune generation controls.'
      },
      {
        value: 'logs',
        label: 'Logs',
        content: 'Generation events and diagnostics appear here.'
      }
    ]
  }
};

export const Disabled: Story = {
  args: {
    items: [
      {
        value: 'advanced',
        label: 'Advanced Parameters',
        content: 'Unavailable while generation is running.',
        disabled: true
      }
    ]
  }
};
