import type { Meta, StoryObj } from '@storybook/nextjs';

import { Label } from './label';
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from './select';

const meta = {
  title: 'UI/Select',
  component: Select,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="level">Level</Label>
      <Select>
        <SelectTrigger id="level"><SelectValue placeholder="Pick a level" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Padel</SelectLabel>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-64"><SelectValue placeholder="Unavailable" /></SelectTrigger>
      <SelectContent><SelectItem value="a">A</SelectItem></SelectContent>
    </Select>
  ),
};
