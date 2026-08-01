import type { Meta, StoryObj } from '@storybook/nextjs';

import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: 'Ana Silva' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: 'Read only' } };

/**
 * Web composes Label + Input at the call site. Mobile binds them into a single
 * `Field` primitive, because 32 of its screens had drifted apart on how to show
 * the error. The difference is deliberate — noted so neither side "fixes" it.
 */
export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" {...args} />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="phone">Phone</Label>
      <Input id="phone" aria-invalid {...args} value="12345" readOnly />
      <p className="text-xs text-destructive">That number is too short.</p>
    </div>
  ),
};
