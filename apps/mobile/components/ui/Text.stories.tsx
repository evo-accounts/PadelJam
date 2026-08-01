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
export const Muted: Story = { args: { tone: 'muted' } };
export const Destructive: Story = { args: { tone: 'destructive' } };
