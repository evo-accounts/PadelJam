import type { Meta, StoryObj } from '@storybook/react-native';

import { IconButton } from './IconButton';

const meta = {
  title: 'UI/IconButton',
  component: IconButton,
  args: { icon: '‹', accessibilityLabel: 'Back', size: 'md' },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Back: Story = {};
export const Filled: Story = { args: { filled: true, icon: '×', accessibilityLabel: 'Close' } };
export const Small: Story = { args: { size: 'sm' } };
/** Only `lg` is 44pt on its own; the smaller sizes reach it via hitSlop. */
export const Large: Story = { args: { size: 'lg' } };
export const Disabled: Story = { args: { disabled: true } };
