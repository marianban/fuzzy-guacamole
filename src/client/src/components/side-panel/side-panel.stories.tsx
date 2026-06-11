import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Button } from '../button/button';
import { SidePanel } from './side-panel';

const meta = {
  title: 'Components/SidePanel',
  component: SidePanel,
  args: {
    title: 'Panel Title',
    content: (
      <div>
        <p>Scrollable content region</p>
        <p>Additional content keeps this slot growing before it scrolls.</p>
      </div>
    ),
    footer: <Button>Footer action</Button>
  },
  decorators: [
    (Story) => (
      <div style={{ height: '720px', width: '320px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof SidePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
