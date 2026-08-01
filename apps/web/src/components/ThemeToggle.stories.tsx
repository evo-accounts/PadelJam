import type { Meta, StoryObj } from '@storybook/nextjs';

import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

/**
 * The theme control, inside a real ThemeProvider.
 *
 * Wrapped in the actual provider rather than a mock: the interesting behaviour
 * IS the provider — it writes the `dark` class onto the document, persists the
 * choice, and reads the OS preference. A mocked `useTheme` would exercise none
 * of that and would still look green.
 *
 * Pressing it here really does flip the surrounding page, because Storybook
 * loads the app's own globals.css.
 */
const meta = {
  title: 'Design System/ThemeToggle',
  component: ThemeToggle,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="rounded-lg border border-border bg-card p-6">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cycles system → light → dark. Three states, because "follow the OS" is one. */
export const Default: Story = {};
