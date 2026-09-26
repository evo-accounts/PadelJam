import type { Meta, StoryObj } from '@storybook/react-native';

import { ProgressBar } from './ProgressBar';

const meta = {
  title: 'UI/ProgressBar',
  component: ProgressBar,
  args: { value: 0.4 },
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The wizard's first step: the path starts at 0 %. */
export const Start: Story = { args: { value: 0 } };
export const Partway: Story = {};
/** 8 of 9 — a public group event on its last step (Invite players skipped). */
export const NearlyDone: Story = { args: { value: 8 / 9 } };
export const Complete: Story = { args: { value: 1 } };
