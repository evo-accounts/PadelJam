import type { Meta, StoryObj } from '@storybook/react-native';

import { Card } from './Card';
import { Text } from './Text';

const meta = {
  title: 'UI/Card',
  component: Card,
  args: { children: <Text variant="body">Clube de Padel do Porto</Text> },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bordered: Story = {};
export const Elevated: Story = { args: { elevated: true } };
export const Tight: Story = { args: { padding: 'sm' } };
/** Only gains accessibilityRole="button" when onPress is supplied. */
export const Pressable: Story = { args: { onPress: () => {} } };
