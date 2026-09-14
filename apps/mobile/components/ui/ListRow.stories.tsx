import type { Meta, StoryObj } from '@storybook/react-native';

import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { ListRow } from './ListRow';

const meta = {
  title: 'UI/ListRow',
  component: ListRow,
  args: { title: 'Ana Silva', subtitle: 'See you Tuesday!' },
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Flat, separated by a hairline rule — chat channels, member lists. */
export const Plain: Story = {
  args: { leading: <Avatar name="Ana Silva" size="md" />, trailing: <Badge label="2" tone="primary" /> },
};

/** A floating surface separated by gaps — notifications. */
export const CardVariant: Story = {
  args: { variant: 'card', leading: <Avatar name="Maria Costa" size="md" /> },
};

export const Highlighted: Story = {
  args: { variant: 'card', highlighted: true, subtitle: 'Unread' },
};

export const TitleOnly: Story = { args: { subtitle: undefined } };

/** Without onPress it renders as a plain View — no button role is claimed. */
export const NotPressable: Story = { args: { onPress: undefined } };

/**
 * A control in the trailing slot: the row splits into a pressable body and a
 * sibling button, so both are reachable by VoiceOver (notifications CTA).
 */
export const TrailingInteractive: Story = {
  args: {
    variant: 'card',
    subtitle: 'invited you to Cascais Social',
    trailing: <Button label="Join" size="sm" onPress={() => {}} />,
    trailingInteractive: true,
    onPress: () => {},
  },
};
