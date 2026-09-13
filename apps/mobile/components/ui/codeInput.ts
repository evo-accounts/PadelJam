/**
 * The one-time-code field's logic, with no React in it.
 *
 * Kept separate for the same reason as `topBarLayout` and `sheetQueue`: the
 * interesting part of a code field is not the boxes, it is what arrives in
 * `onChangeText`. iOS autofill does not hand you six digits — it hands you
 * whatever it scraped, which on a real device has included the surrounding
 * sentence ("Your PadelJam code is 483920"), a space-grouped "12 34 56", and a
 * seventh digit from a message that carried a year. Every one of those has to
 * collapse to the same six characters, and that is testable here without a
 * renderer.
 */

/** Digits only, truncated to `length`. The ONLY value a caller ever receives. */
export const sanitiseCode = (raw: string, length: number): string =>
  raw.replace(/\D/g, '').slice(0, Math.max(0, length));

/**
 * Which box the caret belongs in.
 *
 * Clamps to the LAST box once the code is full, rather than running off the end
 * — a seventh position does not exist, and highlighting nothing while the field
 * still has focus reads as "this field is done with me".
 */
export const activeIndex = (value: string, length: number): number => {
  if (length <= 0) return 0;
  return Math.min(value.length, length - 1);
};

/**
 * How one box paints itself.
 *
 * `invalid` is a state rather than a separate flag because `Field`'s error
 * contract says an error reddens the WHOLE control — not the boxes that happen
 * to be empty — so it has to beat 'filled' and 'active' at every index, and a
 * boolean alongside the state would leave that precedence to each call site.
 */
export type BoxState = 'empty' | 'filled' | 'active' | 'invalid';

export const boxStates = (
  value: string,
  length: number,
  focused: boolean,
  invalid: boolean,
): BoxState[] => {
  const code = sanitiseCode(value, length);
  const caret = activeIndex(code, length);
  return Array.from({ length: Math.max(0, length) }, (_, i): BoxState => {
    if (invalid) return 'invalid';
    if (focused && i === caret) return 'active';
    return i < code.length ? 'filled' : 'empty';
  });
};
