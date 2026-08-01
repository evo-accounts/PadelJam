import type { Meta, StoryObj } from '@storybook/nextjs';

import { Button } from './button';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle, SheetTrigger,
} from './sheet';

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The web counterpart of mobile's bottom sheet — same idea, different edge. */
export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild><Button variant="outline">Filters</Button></SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filter events</SheetTitle>
          <SheetDescription>Narrow the list to what you can actually play.</SheetDescription>
        </SheetHeader>
        <SheetFooter><Button>Apply</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
