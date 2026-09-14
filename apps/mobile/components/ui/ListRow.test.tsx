// @vitest-environment jsdom
/**
 * ListRow's accessibility shape.
 *
 * A pressable ListRow is ONE accessibility element: `Pressable` defaults to
 * `accessible={true}` and the row sets a composed `accessibilityLabel`, so
 * everything inside it is folded into that single node. That is right for a
 * decorative or informative trailing slot and wrong for an interactive one — a
 * Button placed in `trailing` is unreachable to VoiceOver. `trailingInteractive`
 * moves the control out to a sibling of the row's pressable.
 *
 * The split path is a SECOND rendering of the same props, which is how it
 * quietly loses one of them: `disabled` and `selected` are asserted on it here
 * for exactly that reason.
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// A DOM stand-in for the handful of react-native primitives ListRow touches.
// Accessibility props are mirrored onto ARIA so the assertions read naturally.
vi.mock('react-native', () => {
  type AnyProps = Record<string, unknown> & { children?: ReactNode };
  const flag = (v: boolean | undefined) => (v === undefined ? undefined : String(v));
  const a11y = (p: AnyProps) => {
    const state = p.accessibilityState as { selected?: boolean; disabled?: boolean } | undefined;
    return {
      role: p.accessibilityRole as string | undefined,
      'aria-label': p.accessibilityLabel as string | undefined,
      'aria-selected': flag(state?.selected),
      'aria-disabled': flag(state?.disabled),
      'data-accessible': p.accessible === false ? 'false' : undefined,
      'data-testid': p.testID as string | undefined,
    };
  };
  return {
    View: (p: AnyProps) => createElement('div', a11y(p), p.children),
    Pressable: (p: AnyProps) =>
      createElement(
        'button',
        {
          ...a11y(p),
          disabled: p.disabled as boolean | undefined,
          onClick: p.onPress as () => void,
          'data-pressable': 'true',
        },
        p.children,
      ),
    StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  };
});
vi.mock('../../theme', () => ({
  colors: new Proxy({}, { get: () => 'token' }),
  radius: new Proxy({}, { get: () => 8 }),
  space: new Proxy({}, { get: () => 8 }),
}));
vi.mock('./Text', () => ({
  Text: (p: { children?: ReactNode; accessibilityRole?: string }) =>
    createElement('span', { role: p.accessibilityRole }, p.children),
}));

import { ListRow } from './ListRow';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(el: ReactNode) {
  act(() => root.render(el));
}

const trailingButton = () =>
  createElement('button', { 'data-testid': 'cta', 'aria-label': 'Join' }, 'Join');

describe('ListRow accessibility shape', () => {
  it('folds an informative trailing into the single row element', () => {
    render(
      createElement(ListRow, {
        title: 'Partner Requests',
        trailing: createElement('span', null, '2 pending'),
        trailingLabel: '2 pending',
        onPress: () => {},
      }),
    );
    const buttons = container.querySelectorAll('[data-pressable]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Partner Requests, 2 pending');
  });

  it('renders an interactive trailing as a sibling of the row pressable', () => {
    const onPress = vi.fn();
    render(
      createElement(ListRow, {
        title: 'Maria invited you to Cascais Social',
        subtitle: 'Could not complete that action.',
        trailing: trailingButton(),
        trailingInteractive: true,
        onPress,
        testID: 'row',
      }),
    );
    const row = container.querySelector('[data-pressable]')!;
    const cta = container.querySelector('[data-testid="cta"]')!;
    // The control is reachable: it is NOT inside the row's accessibility element.
    expect(row.contains(cta)).toBe(false);
    // The row still names itself from title and subtitle, and never from the
    // control — the control announces its own label.
    expect(row.getAttribute('aria-label')).toBe(
      'Maria invited you to Cascais Social, Could not complete that action.',
    );
    expect(row.getAttribute('role')).toBe('button');
    (row as HTMLButtonElement).click();
    expect(onPress).toHaveBeenCalledTimes(1);
    // The card surface keeps the testID so E2E selectors do not move.
    const surface = container.querySelector('[data-testid="row"]')!;
    expect(surface).not.toBeNull();
    // ...and it is the surface, not the pressable, that carries it now.
    expect(surface.contains(row)).toBe(true);
    expect(surface.contains(cta)).toBe(true);
  });

  it('ignores trailingLabel when the trailing is interactive', () => {
    render(
      createElement(ListRow, {
        title: 'Title',
        trailing: trailingButton(),
        trailingLabel: 'Join',
        trailingInteractive: true,
        onPress: () => {},
      }),
    );
    expect(container.querySelector('[data-pressable]')!.getAttribute('aria-label')).toBe('Title');
  });

  it('carries disabled and selected onto the split row body', () => {
    const onPress = vi.fn();
    render(
      createElement(ListRow, {
        title: 'Title',
        trailing: trailingButton(),
        trailingInteractive: true,
        disabled: true,
        selected: true,
        onPress,
      }),
    );
    const row = container.querySelector('[data-pressable]') as HTMLButtonElement;
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('aria-selected')).toBe('true');
    row.click();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('leaves accessibilityState off a plain split row', () => {
    render(
      createElement(ListRow, {
        title: 'Title',
        trailing: trailingButton(),
        trailingInteractive: true,
        onPress: () => {},
      }),
    );
    const row = container.querySelector('[data-pressable]')!;
    expect(row.hasAttribute('aria-disabled')).toBe(false);
    expect(row.hasAttribute('aria-selected')).toBe(false);
  });

  it('keeps the destructive subtitle inside the body, still announced as an alert', () => {
    render(
      createElement(ListRow, {
        title: 'Title',
        subtitle: 'Could not complete that action.',
        subtitleTone: 'destructive',
        trailing: trailingButton(),
        trailingInteractive: true,
        onPress: () => {},
      }),
    );
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe('Could not complete that action.');
    expect(container.querySelector('[data-pressable]')!.contains(alert)).toBe(true);
  });

  it('stays one element when trailingInteractive is set but there is no trailing', () => {
    render(
      createElement(ListRow, {
        title: 'Title',
        trailingInteractive: true,
        onPress: () => {},
        testID: 'row',
      }),
    );
    const row = container.querySelector('[data-pressable]')!;
    // The pressable IS the surface again, so the testID never moves off it.
    expect(row.getAttribute('data-testid')).toBe('row');
  });
});
