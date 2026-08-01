import type { Meta, StoryObj } from '@storybook/react-native';

import { Field } from './Field';

const meta = {
  title: 'UI/Field',
  component: Field,
  args: { label: 'Name', placeholder: 'Ana Silva' },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { required: true } };
export const WithHint: Story = { args: { hint: 'Shown to other players.' } };
export const Invalid: Story = { args: { error: 'That number is too short.', value: '12345' } };
/** error wins over hint, so a validation failure can never be hidden. */
export const ErrorBeatsHint: Story = {
  args: { hint: 'Help text', error: 'Something is wrong.' },
};
export const Disabled: Story = { args: { editable: false, value: 'Read only' } };
