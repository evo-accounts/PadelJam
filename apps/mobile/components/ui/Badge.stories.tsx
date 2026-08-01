import type { Meta, StoryObj } from '@storybook/react-native';

import { Badge } from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { label: 'Confirmed', tone: 'neutral' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Primary: Story = { args: { tone: 'primary', label: 'Organiser' } };
export const Success: Story = { args: { tone: 'success', label: 'Paid' } };
export const Warning: Story = { args: { tone: 'warning', label: 'Pending' } };
export const Destructive: Story = { args: { tone: 'destructive', label: 'Cancelled' } };
export const Info: Story = { args: { tone: 'info', label: 'Waitlist' } };
