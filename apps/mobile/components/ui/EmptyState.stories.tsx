import type { Meta, StoryObj } from '@storybook/react-native';

import { EmptyState } from './EmptyState';

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
  args: {
    title: 'No matches yet',
    body: 'When someone books a court near you, it shows up here.',
    action: { label: 'Find a court', onPress: () => {} },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAction: Story = {};
/** Discouraged: an empty screen with no next step is a dead end. */
export const TitleOnly: Story = { args: { body: undefined, action: undefined } };
