import type { Meta, StoryObj } from '@storybook/react-native';

import { SearchInput } from './SearchInput';

const meta = {
  title: 'UI/SearchInput',
  component: SearchInput,
  args: { placeholder: 'Search' },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { value: 'Ana' } };
/** The five list screens all set their own margin and let the box fill the row. */
export const InALayout: Story = { args: { containerStyle: { margin: 16 } } };
