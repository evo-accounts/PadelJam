import type { Meta, StoryObj } from '@storybook/react-native';

import { AvatarStack } from './AvatarStack';

const people = ['Ana Paula Silva', 'João Pereira', 'Maria Santos', 'Sofia Costa', 'Rui Lopes', 'Inês Rocha'].map(
  (name, i) => ({ id: `u${i}`, name, uri: null }),
);

const meta = {
  title: 'UI/AvatarStack',
  component: AvatarStack,
  args: { people, countLabel: '6 players' },
} satisfies Meta<typeof AvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five avatars, then the count — the group header's members line (UX-GRP-04). */
export const Default: Story = {};
export const Few: Story = { args: { people: people.slice(0, 2), countLabel: '2 players' } };
export const Empty: Story = { args: { people: [], countLabel: '0 players' } };
