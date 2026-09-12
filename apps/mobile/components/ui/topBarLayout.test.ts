import { describe, expect, it } from 'vitest';
import { topBarLayout } from './topBarLayout';

describe('topBarLayout', () => {
  it('top: left title, no left control, no divider', () => {
    expect(topBarLayout('top', { actionCount: 1 })).toEqual({
      left: 'none',
      titleAlign: 'left',
      titleVariant: 'title',
      right: 'actions',
      divider: false,
      sideWidth: 'single',
    });
  });
  it('nav: back, centred title, divider', () => {
    expect(topBarLayout('nav', { actionCount: 1 })).toEqual({
      left: 'back',
      titleAlign: 'center',
      titleVariant: 'bodyStrong',
      right: 'actions',
      divider: true,
      sideWidth: 'single',
    });
  });
  it('nav without a title keeps the slot empty (entity detail screens)', () => {
    expect(topBarLayout('nav', { actionCount: 0 }).titleAlign).toBe('center');
  });
  it('edit: close on the left', () => {
    expect(topBarLayout('edit', { actionCount: 1 }).left).toBe('close');
  });
  it('wizard: back left, close right', () => {
    expect(topBarLayout('wizard', { actionCount: 0 })).toEqual({
      left: 'back',
      titleAlign: 'center',
      titleVariant: 'bodyStrong',
      right: 'close',
      divider: true,
      sideWidth: 'single',
    });
  });

  it('sideWidth is single for 0 or 1 actions, double for 2 and triple for 3, so both side slots match', () => {
    expect(topBarLayout('nav', { actionCount: 0 }).sideWidth).toBe('single');
    expect(topBarLayout('nav', { actionCount: 1 }).sideWidth).toBe('single');
    expect(topBarLayout('nav', { actionCount: 2 }).sideWidth).toBe('double');
    expect(topBarLayout('nav', { actionCount: 3 }).sideWidth).toBe('triple');
  });
});
