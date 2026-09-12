import { describe, expect, it } from 'vitest';
import { topBarLayout } from './topBarLayout';

describe('topBarLayout', () => {
  it('top: left title, no left control, no divider', () => {
    expect(topBarLayout('top', { hasTitle: true })).toEqual({ left: 'none', titleAlign: 'left', titleVariant: 'title', right: 'actions', divider: false });
  });
  it('nav: back, centred title, divider', () => {
    expect(topBarLayout('nav', { hasTitle: true })).toEqual({ left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true });
  });
  it('nav without a title keeps the slot empty (entity detail screens)', () => {
    expect(topBarLayout('nav', { hasTitle: false }).titleAlign).toBe('center');
  });
  it('edit: close on the left', () => {
    expect(topBarLayout('edit', { hasTitle: true }).left).toBe('close');
  });
  it('wizard: back left, close right', () => {
    expect(topBarLayout('wizard', { hasTitle: true })).toEqual({ left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'close', divider: true });
  });
});
