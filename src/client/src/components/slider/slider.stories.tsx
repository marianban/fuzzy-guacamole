import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Slider } from './slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  args: {
    'aria-label': 'Steps',
    label: 'Steps',
    max: 100,
    min: 1,
    value: 50
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return <Slider {...args} onChange={setValue} value={value} />;
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true
  }
};
