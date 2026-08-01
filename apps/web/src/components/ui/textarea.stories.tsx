import type { Meta, StoryObj } from '@storybook/nextjs';

import { Label } from './label';
import { Textarea } from './textarea';

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  args: { placeholder: 'Say something to the group…' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: 'Read only' } };
export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-80 flex-col gap-2">
      <Label htmlFor="msg">Message</Label>
      <Textarea id="msg" {...args} />
    </div>
  ),
};
