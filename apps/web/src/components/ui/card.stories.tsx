import type { Meta, StoryObj } from '@storybook/nextjs';

import { Button } from './button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Clube de Padel do Porto</CardTitle>
        <CardDescription>Tuesday, 19:00 — 2 courts</CardDescription>
        <CardAction>
          <Button size="sm" variant="secondary">Edit</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Six players confirmed, two spots left.</p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Join</Button>
      </CardFooter>
    </Card>
  ),
};

/** Header only — the shape most lists actually use. */
export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Tuesday Americano</CardTitle>
        <CardDescription>8 players</CardDescription>
      </CardHeader>
    </Card>
  ),
};
