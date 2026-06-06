import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { ArrowRight, Download, Play } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Generate'
  },
  decorators: [
    (Story) => (
      <div style={{ display: 'flex', alignItems: 'center', minHeight: '96px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true
  }
};

export const WithIcons: Story = {
  args: {
    leftSection: <Play size={16} />,
    rightSection: <ArrowRight size={16} />
  }
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button size="xs">Generate</Button>
      <Button size="sm">Generate</Button>
      <Button size="md">Generate</Button>
      <Button size="lg">Generate</Button>
      <Button size="xl" leftSection={<Download size={18} />}>
        Export
      </Button>
    </div>
  )
};
