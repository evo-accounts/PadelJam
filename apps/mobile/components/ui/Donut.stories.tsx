import type { Meta, StoryObj } from '@storybook/react-native';

import { Donut } from './Donut';

const meta = {
  title: 'UI/Donut',
  component: Donut,
  args: { value: 5, total: 8, accessibilityLabel: 'Confirmed' },
} satisfies Meta<typeof Donut>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nobody yet: the track only. */
export const Empty: Story = { args: { value: 0, total: 8 } };
export const Partway: Story = {};
export const Full: Story = { args: { value: 8, total: 8 } };
/** Paid with nobody confirmed: 0/0 draws the empty ring rather than dividing by zero. */
export const NothingToCount: Story = { args: { value: 0, total: 0, accessibilityLabel: 'Paid' } };
export const Large: Story = { args: { size: 112 } };
