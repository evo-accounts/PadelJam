import type { Meta, StoryObj } from '@storybook/react-native';

import { Avatar } from './Avatar';

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  args: { name: 'Ana Paula Silva', size: 'lg' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};
/** "Ana Paula Silva" -> "AS": first and last word, never the first two letters. */
export const SingleName: Story = { args: { name: 'Ana' } };
export const Unknown: Story = { args: { name: null } };
export const ExtraSmall: Story = { args: { size: 'xs' } };
export const ExtraLarge: Story = { args: { size: 'xl' } };
