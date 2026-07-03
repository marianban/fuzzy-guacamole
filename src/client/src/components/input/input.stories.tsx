import { Hash, Search } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Input } from './input';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: {
    label: 'Seed',
    placeholder: 'Enter seed'
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    defaultValue: '184726391'
  }
};

export const WithDescription: Story = {
  args: {
    description: 'Use a fixed seed to reproduce the same image.'
  }
};

export const Error: Story = {
  args: {
    defaultValue: '-1',
    error: 'Seed must be a positive number.'
  }
};

export const Required: Story = {
  args: {
    required: true
  }
};

export const Disabled: Story = {
  args: {
    defaultValue: 'Generation is running.',
    disabled: true
  }
};

export const WithSections: Story = {
  args: {
    leftSection: <Hash size={16} />,
    rightSection: <Search size={16} />,
    placeholder: 'Search by seed'
  }
};
