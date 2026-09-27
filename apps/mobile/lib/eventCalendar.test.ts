import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '26.0' } }));
vi.mock('expo-calendar/legacy', () => ({}));

import { editorNeedsPermission } from './eventCalendar';

describe('editorNeedsPermission', () => {
  it('asks only on iOS before 17', () => {
    expect(editorNeedsPermission('ios', '16.4')).toBe(true);
    expect(editorNeedsPermission('ios', '17.0')).toBe(false);
    expect(editorNeedsPermission('ios', '26.0')).toBe(false);
  });

  it('never asks on Android, whose editor is an Intent', () => {
    expect(editorNeedsPermission('android', 34)).toBe(false);
  });
});
