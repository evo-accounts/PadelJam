import { describe, expect, it } from 'vitest';
import { activeIndex, boxStates, sanitiseCode } from './codeInput';

describe('sanitiseCode', () => {
  it('keeps a clean six-digit code untouched', () => {
    expect(sanitiseCode('123456', 6)).toBe('123456');
  });

  it('strips the spaces out of a grouped paste', () => {
    expect(sanitiseCode('12 34 56', 6)).toBe('123456');
  });

  it('truncates an overlong paste to the field length', () => {
    expect(sanitiseCode('1234567', 6)).toBe('123456');
  });

  it('drops letters rather than rejecting the whole value', () => {
    expect(sanitiseCode('12a3', 6)).toBe('123');
  });

  it('pulls the code out of an autofill payload carrying the whole message', () => {
    expect(sanitiseCode('Your PadelJam code is 483920 — do not share it.', 6)).toBe('483920');
  });

  it('honours a non-default length', () => {
    expect(sanitiseCode('1234', 4)).toBe('1234');
    expect(sanitiseCode('12345', 4)).toBe('1234');
  });

  it('returns nothing for a value with no digits at all', () => {
    expect(sanitiseCode('', 6)).toBe('');
    expect(sanitiseCode('abc', 6)).toBe('');
  });
});

describe('activeIndex', () => {
  it('is the next empty box while the code is being typed', () => {
    expect(activeIndex('', 6)).toBe(0);
    expect(activeIndex('12', 6)).toBe(2);
  });

  it('clamps to the last box once the code is full, instead of running off the end', () => {
    expect(activeIndex('123456', 6)).toBe(5);
  });
});

describe('boxStates', () => {
  it('marks typed boxes filled and the rest empty when unfocused', () => {
    expect(boxStates('123', 6, false, false)).toEqual([
      'filled', 'filled', 'filled', 'empty', 'empty', 'empty',
    ]);
  });

  it('puts the caret on the next empty box while focused', () => {
    expect(boxStates('123', 6, true, false)).toEqual([
      'filled', 'filled', 'filled', 'active', 'empty', 'empty',
    ]);
  });

  it('keeps the caret on the last box once the code is complete', () => {
    expect(boxStates('123456', 6, true, false)).toEqual([
      'filled', 'filled', 'filled', 'filled', 'filled', 'active',
    ]);
  });

  it('marks EVERY box invalid regardless of how many are filled', () => {
    // Field's contract: an error reddens the whole control, not the filled part
    // of it. The empty boxes go red too, and the caret loses to the error.
    expect(boxStates('12', 6, true, true)).toEqual([
      'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid',
    ]);
    expect(boxStates('', 6, false, true)).toEqual([
      'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid',
    ]);
  });

  it('returns one state per box', () => {
    expect(boxStates('1', 4, true, false)).toHaveLength(4);
  });
});
