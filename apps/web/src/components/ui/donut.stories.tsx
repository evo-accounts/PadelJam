import type { Meta, StoryObj } from '@storybook/nextjs';

import { Donut } from './donut';

const meta = {
  title: 'UI/Donut',
  component: Donut,
  parameters: { layout: 'centered' },
  args: { value: 5, total: 8, label: 'Confirmed' },
} satisfies Meta<typeof Donut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: 0, total: 8 } };
export const Full: Story = { args: { value: 8, total: 8 } };
export const NothingToCount: Story = { args: { value: 0, total: 0, label: 'Paid' } };
export const Large: Story = { args: { size: 120 } };
