import type { Meta, StoryObj } from '@storybook/react-native';

import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { label: 'Book a court', variant: 'primary', size: 'md' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Destructive: Story = { args: { variant: 'destructive', label: 'Leave group' } };
export const Disabled: Story = { args: { disabled: true } };
/** The label stays mounted so the button keeps its width and its a11y name. */
export const Loading: Story = { args: { loading: true } };
