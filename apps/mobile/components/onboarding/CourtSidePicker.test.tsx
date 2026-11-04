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
    Image: () => createElement('img', { 'data-fox': 'true' }),
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

import { CourtSidePicker } from './CourtSidePicker';

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

function render(value: 'left' | 'right' | null, onChange: (v: string) => void = () => {}) {
  act(() =>
    root.render(
      createElement(CourtSidePicker, {
        value,
        onChange,
        leftLabel: 'Left side',
        rightLabel: 'Right side',
        switchLabel: 'Switch side',
        fox: 1 as never,
        testID: 'side',
      }),
    ),
  );
}

const radios = () => Array.from(container.querySelectorAll('[role="radio"]'));
const swap = () => container.querySelector('[aria-label="Switch side"]') as HTMLButtonElement | null;

describe('CourtSidePicker', () => {
  it('is a radiogroup of two radios named by their labels, nothing checked at first', () => {
    render(null);
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual(['Left side', 'Right side']);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    expect(swap()).toBeNull();
    expect(container.querySelector('[data-fox]')).toBeNull();
  });

  it('checks the chosen half, with the fox on it, and reports taps', () => {
    const onChange = vi.fn();
    render('left', onChange);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(container.querySelectorAll('[data-fox]')).toHaveLength(1);
    act(() => (radios()[1] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith('right');
  });

  it('the swap button flips the selection', () => {
    const onChange = vi.fn();
    render('left', onChange);
    act(() => swap()!.click());
    expect(onChange).toHaveBeenLastCalledWith('right');
    render('right', onChange);
    act(() => swap()!.click());
    expect(onChange).toHaveBeenLastCalledWith('left');
  });
});
