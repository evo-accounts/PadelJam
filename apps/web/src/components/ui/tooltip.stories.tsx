import type { Meta, StoryObj } from '@storybook/nextjs';

import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Hover-only, so it must never carry information the user cannot get otherwise
 * — there is no equivalent on mobile, which is touch-first.
 */
export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="ghost">Scoring</Button></TooltipTrigger>
        <TooltipContent>Americano rotates partners every round</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
