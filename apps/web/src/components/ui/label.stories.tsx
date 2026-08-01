import type { Meta, StoryObj } from '@storybook/nextjs';

import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'UI/Label',
  component: Label,
  args: { children: 'Display name' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** htmlFor is what makes the label a hit target for its control — not optional. */
export const BoundToAnInput: Story = {
  render: (args) => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="display-name" {...args} />
      <Input id="display-name" placeholder="Ana Silva" />
    </div>
  ),
};
