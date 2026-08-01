import type { Meta, StoryObj } from '@storybook/nextjs';

import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'Confirmed', variant: 'default' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Organiser' } };
export const Outline: Story = { args: { variant: 'outline', children: 'Waitlist' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Draft' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Cancelled' } };
