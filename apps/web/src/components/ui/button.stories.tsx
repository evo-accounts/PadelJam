import type { Meta, StoryObj } from '@storybook/nextjs';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Book a court', variant: 'primary', size: 'md' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'tertiary', 'info', 'success', 'warning', 'destructive'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Tertiary: Story = { args: { variant: 'tertiary' } };
export const Info: Story = { args: { variant: 'info' } };
export const Success: Story = { args: { variant: 'success' } };
export const Warning: Story = { args: { variant: 'warning' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Leave group' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const Invalid: Story = { args: { 'aria-invalid': true } };
export const WithIcons: Story = {
  args: {
    children: (
      <>
        <PlusIcon />
        Book a court
        <ArrowRightIcon />
      </>
    ),
  },
};

/** Every style at every size — the layout of the Figma "Solid Button" frame, rotated. */
export const Matrix: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          {SIZES.map((size) => (
            <Button key={size} {...args} variant={variant} size={size}>
              Button
            </Button>
          ))}
          <Button {...args} variant={variant} disabled>
            Button
          </Button>
          <Button {...args} variant={variant} aria-invalid>
            Button
          </Button>
          <Button {...args} variant={variant} loading>
            Button
          </Button>
        </div>
      ))}
    </div>
  ),
};
