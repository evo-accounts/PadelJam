import type { Meta, StoryObj } from '@storybook/nextjs';

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from './avatar';

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>AS</AvatarFallback>
    </Avatar>
  ),
};

/**
 * Web has AvatarGroup and a count; mobile's Avatar does not. Documented as a
 * real difference rather than quietly matched — there is no mobile screen that
 * stacks avatars yet.
 */
export const Group: Story = {
  render: () => (
    <AvatarGroup>
      {['AS', 'MC', 'JP'].map((i) => (
        <Avatar key={i}>
          <AvatarFallback>{i}</AvatarFallback>
        </Avatar>
      ))}
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
  ),
};
