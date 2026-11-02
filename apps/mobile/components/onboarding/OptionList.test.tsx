// @vitest-environment jsdom
/**
 * OptionList: selection, accessibility state and disabled.
 *
 * The container is a `radiogroup` and every card a `radio` that reports
 * `checked`. The E2E harness reads those, so they are asserted here rather
 * than left to a simulator run.
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  type AnyProps = Record<string, unknown> & { children?: ReactNode };
  const flag = (v: boolean | undefined) => (v === undefined ? undefined : String(v));
  const a11y = (p: AnyProps) => {
    const state = p.accessibilityState as { checked?: boolean; disabled?: boolean } | undefined;
    return {
      role: p.accessibilityRole as string | undefined,
      'aria-label': p.accessibilityLabel as string | undefined,
      'aria-checked': flag(state?.checked),
      'aria-disabled': flag(state?.disabled),
      'data-testid': p.testID as string | undefined,
    };
  };
  return {
    View: (p: AnyProps) => createElement('div', a11y(p), p.children),
    Image: () => createElement('img', { 'data-badge': 'true' }),
    Pressable: (p: AnyProps) =>
      createElement(
        'button',
        { ...a11y(p), disabled: p.disabled as boolean | undefined, onClick: p.onPress as () => void },
        p.children,
      ),
    StyleSheet: { create: <T,>(s: T) => s },
  };
});
vi.mock('../../theme', () => ({
  onboardingColors: new Proxy({}, { get: () => 'token' }),
  radius: new Proxy({}, { get: () => 8 }),
  space: new Proxy({}, { get: () => 8 }),
  type: new Proxy({}, { get: () => ({}) }),
}));
vi.mock('../ui', () => ({
  Text: (p: { children?: ReactNode }) => createElement('span', null, p.children),
}));
vi.mock('../ui/native', () => ({
  Text: (p: { children?: ReactNode }) => createElement('span', null, p.children),
}));

import { OptionList } from './OptionList';

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

const options = [
  { value: 'left', title: 'Left' },
  { value: 'right', title: 'Right', description: 'The usual one.', badge: 1 },
] as const;

function render(value: 'left' | 'right' | null, extra: { onChange?: (v: string) => void; disabled?: boolean } = {}) {
  act(() =>
    root.render(
      createElement(OptionList, {
        options: options as never,
        value,
        onChange: extra.onChange ?? (() => {}),
        disabled: extra.disabled,
        testID: 'hand',
      }),
    ),
  );
}

const cards = () => Array.from(container.querySelectorAll('[role="radio"]'));

describe('OptionList', () => {
  it('is a radiogroup of radios named by their title', () => {
    render(null);
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Left', 'Right. The usual one.']);
  });

  it('reports checked on the selected card only', () => {
    render('right');
    expect(cards().map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('nothing is checked until a value is chosen', () => {
    render(null);
    expect(cards().map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'false']);
  });

  it('calls onChange with the tapped value', () => {
    const onChange = vi.fn();
    render(null, { onChange });
    act(() => (cards()[1] as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith('right');
  });

  it('shows the badge on the selected card only', () => {
    render('right');
    expect(cards()[0]?.querySelector('[data-badge]')).toBeNull();
    expect(cards()[1]?.querySelector('[data-badge]')).not.toBeNull();
  });

  it('disabled: cards report it and ignore taps', () => {
    const onChange = vi.fn();
    render('left', { onChange, disabled: true });
    expect(cards().map((c) => c.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    act(() => (cards()[1] as HTMLElement).click());
    expect(onChange).not.toHaveBeenCalled();
  });
});
