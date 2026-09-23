import type { Meta, StoryObj } from '@storybook/react-native';

import { DateField } from './DateField';

const meta = {
  title: 'UI/DateField',
  component: DateField,
  args: { label: 'Date of birth', value: null, placeholder: 'Choose a date', confirmLabel: 'Confirm', onChange: () => {} },
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithValue: Story = { args: { value: '1990-04-17' } };
