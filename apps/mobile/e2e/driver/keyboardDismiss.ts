import type { AxElement } from './a11y';

/**
 * Which caption to tap to dismiss the software keyboard.
 *
 * Pure so it can be tested against real captured trees: the first version of
 * this logic shipped a bug that only appears on a SCROLLED screen, and a
 * hand-driven check on an unscrolled one passed it.
 *
 * The rules, each earned:
 *
 *   - Below the header. Captions scroll under it. On Edit profile, scrolled,
 *     the topmost caption was "Name" at y=91..111 while the Close button
 *     occupied y=70..114 — tapping it hit the header, and had the x overlapped
 *     the ✕ it would have closed the screen and discarded the edit. The header's
 *     extent is measured from the buttons actually in it, not assumed.
 *   - Clear of the keyboard, with margin.
 *   - Not overlapping any button, so a caption inside a pressable row is never
 *     mistaken for inert text.
 *
 * Returns candidates in order, so a caller that taps one and finds the keyboard
 * still up can try the next.
 */
export function dismissCaptions(tree: AxElement[], keyboardTopY: number): AxElement[] {
  const buttons = tree.filter((e) => e.type === 'Button');

  // Anything a button occupies at the top of the screen is header furniture: a
  // back or close control, and on some screens a photo picker above it.
  const headerBottom = buttons
    .filter((e) => e.frame.y < 160)
    .reduce((low, e) => Math.max(low, e.frame.y + e.frame.height), 0);

  const overlapsAButton = (e: AxElement) =>
    buttons.some(
      (b) => e.frame.y < b.frame.y + b.frame.height && b.frame.y < e.frame.y + e.frame.height,
    );

  return tree
    .filter(
      (e) =>
        e.type === 'StaticText'
        && e.frame.y >= headerBottom + 8
        && e.frame.y + e.frame.height < keyboardTopY - 40
        && !overlapsAButton(e),
    )
    .sort((a, b) => a.frame.y - b.frame.y);
}
