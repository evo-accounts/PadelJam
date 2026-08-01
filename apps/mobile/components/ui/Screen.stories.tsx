import type { Meta, StoryObj } from '@storybook/react-native';

import { Loading } from './Screen';

const meta = {
  title: 'UI/Loading',
  component: Loading,
  args: { label: 'Loading matches…', fill: false },
} satisfies Meta<typeof Loading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLabel: Story = {};
export const SpinnerOnly: Story = { args: { label: undefined } };
