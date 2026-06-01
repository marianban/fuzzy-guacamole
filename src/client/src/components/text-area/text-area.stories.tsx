import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { TextArea } from './text-area';

const meta = {
  title: 'Components/TextArea',
  component: TextArea,
  args: {
    'aria-label': 'Prompt'
  },
  decorators: [
    (Story) => (
      <div style={{ width: '287px' }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof TextArea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue:
      'A hyper-realistic modernist villa\nnestled in a vibrant mossy forest,\ngolden hour lighting, cinematic\natmosphere, 8k resolution.'
  }
};

export const Placeholder: Story = {
  args: {
    placeholder: 'Describe the image you want to generate...'
  }
};

export const Disabled: Story = {
  args: {
    defaultValue: 'Prompt editing is unavailable while generation is running.',
    disabled: true
  }
};

export const LongContent: Story = {
  args: {
    defaultValue:
      'A detailed editorial portrait with subtle rim lighting, natural skin texture, a soft cinematic background, layered depth of field, and a restrained color palette.'
  }
};
