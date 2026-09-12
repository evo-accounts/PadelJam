import { describe, expect, it } from 'vitest';
import { backTarget } from './backTarget';

describe('backTarget', () => {
  it('pops when there is history', () => {
    expect(backTarget(true)).toEqual({ kind: 'back' });
  });
  it('falls back to Home when there is no history', () => {
    expect(backTarget(false)).toEqual({ kind: 'replace', href: '/' });
  });
});
