import type { Meta, StoryObj } from '@storybook/react-native';

import { TopBar } from './TopBar';

const meta = {
  title: 'UI/TopBar',
  component: TopBar,
  args: { title: 'Members', backLabel: 'Back' },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = { args: { onBack: () => {} } };
/** Root screens have no parent, so no back affordance. */
export const RootScreen: Story = {};
/** Both side slots are the same fixed width, so the title stays truly centred. */
export const WithAction: Story = {
  args: { onBack: () => {}, action: { icon: '⋯', label: 'More', onPress: () => {} } },
};
export const LongTitle: Story = {
  args: { onBack: () => {}, title: 'A title long enough that it has to truncate somewhere' },
};
