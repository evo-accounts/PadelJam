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
export const Tertiary: Story = { args: { variant: 'tertiary' } };
export const Info: Story = { args: { variant: 'info' } };
export const Success: Story = { args: { variant: 'success' } };
export const Warning: Story = { args: { variant: 'warning' } };
export const Destructive: Story = { args: { variant: 'destructive', label: 'Leave group' } };
export const ExtraSmall: Story = { args: { size: 'xs' } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Disabled: Story = { args: { disabled: true } };
/** The label stays mounted so the button keeps its width and its a11y name. */
export const Loading: Story = { args: { loading: true } };
