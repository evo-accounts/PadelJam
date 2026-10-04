import type { Meta, StoryObj } from '@storybook/react-native';

import { Text } from './Text';

const meta = {
  title: 'UI/Text',
  component: Text,
  args: { children: 'Padel on Saturday at 10', variant: 'body', tone: 'default' },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {};
export const Display: Story = { args: { variant: 'display' } };
export const Title: Story = { args: { variant: 'title' } };
export const Heading: Story = { args: { variant: 'heading' } };
export const Label: Story = { args: { variant: 'label' } };
export const Hint: Story = { args: { variant: 'hint' } };
// The welcome slides' pair: 36/40 bold in purple-900, then 18/28 regular in slate-500.
export const HeroTitle: Story = {
  args: { variant: 'heroTitle', tone: 'cardForeground', children: 'Find games near you' },
};
export const HeroBody: Story = {
  args: {
    variant: 'heroBody',
    tone: 'soft',
    children: 'Take a peek at nearby padel courts. Your next match might be closer than you think.',
  },
};
export const Muted: Story = { args: { tone: 'muted' } };
export const Soft: Story = { args: { tone: 'soft' } };
export const CardForeground: Story = { args: { tone: 'cardForeground' } };
export const Destructive: Story = { args: { tone: 'destructive' } };
