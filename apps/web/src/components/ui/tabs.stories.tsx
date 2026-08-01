import type { Meta, StoryObj } from '@storybook/nextjs';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="going" className="w-80">
      <TabsList>
        <TabsTrigger value="going">Going</TabsTrigger>
        <TabsTrigger value="organizing">Organizing</TabsTrigger>
      </TabsList>
      <TabsContent value="going" className="pt-3 text-sm text-muted-foreground">
        Tuesday Americano, Friday Social
      </TabsContent>
      <TabsContent value="organizing" className="pt-3 text-sm text-muted-foreground">
        Live Mexicano
      </TabsContent>
    </Tabs>
  ),
};
