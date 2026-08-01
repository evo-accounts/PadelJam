import type { Meta, StoryObj } from '@storybook/react-native';

import { Chip } from './Chip';

const meta = {
  title: 'UI/Chip',
  component: Chip,
  args: { label: 'Beginner' },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = {};
/** Selection is fill + border + accessibilityState.selected, never colour alone. */
export const Selected: Story = { args: { selected: true } };
export const Disabled: Story = { args: { disabled: true } };
