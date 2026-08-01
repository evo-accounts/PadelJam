import type { Meta, StoryObj } from '@storybook/nextjs';

import { Separator } from './separator';

const meta = {
  title: 'UI/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64 text-sm text-foreground">
      Players
      <Separator className="my-3" />
      Courts
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-10 items-center gap-3 text-sm text-foreground">
      Going
      <Separator orientation="vertical" />
      Organizing
    </div>
  ),
};
