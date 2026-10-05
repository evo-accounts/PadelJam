/**
 * Which page a horizontal `pagingEnabled` ScrollView is showing.
 *
 * Split out because the two things that break it are both invisible in a
 * screenshot: a `width` of 0 (the first frame, before `onLayout` has measured
 * anything) divides by zero, and an over-scroll bounce at either end produces
 * an offset outside the real page range. Both are arithmetic, so both are
 * tested here rather than on a device.
 */
export const pageIndex = (offsetX: number, width: number, count: number): number => {
  if (count <= 0) return 0;
  if (!Number.isFinite(width) || width <= 0) return 0;
  const raw = Math.round(offsetX / width);
  return Math.min(count - 1, Math.max(0, raw));
};

/**
 * Whether a change of the displayed page has to move the ScrollView itself.
 *
 * `swipedTo` is the page the USER's finger last reported through `onScroll`, or
 * `null` if nothing has since been consumed. When `current` is that same page,
 * the ScrollView is already there — or, mid-drag, is deliberately somewhere
 * between two pages under the user's finger — and calling `scrollTo` on it is the
 * bug this exists to prevent: `current` flips at the half-way rounding threshold
 * while the finger is still down, and an animated `scrollTo` to the new page's
 * offset then fights the drag, so the pager lurches toward the page it just
 * rounded to instead of following the finger.
 *
 * Anything else — a controlled caller moving `index`, a rotation changing the
 * width — still scrolls. The caller clears `swipedTo` after EVERY consult, not
 * only a skip: left set, a later "Back" to that same page would be taken for the
 * user's own swipe and silently not scroll.
 */
export const shouldScrollTo = (current: number, swipedTo: number | null): boolean =>
  swipedTo === null || current !== swipedTo;

/**
 * The page a screen-reader swipe moves to: VoiceOver's swipe up on an `adjustable` element is
 * `increment` (next), swipe down is `decrement` (previous). Clamped at both ends, like the pager
 * itself, which does not wrap; any other action leaves the page where it is.
 */
export const stepPage = (current: number, action: string, count: number): number => {
  if (count <= 0) return 0;
  const delta = action === 'increment' ? 1 : action === 'decrement' ? -1 : 0;
  return Math.min(count - 1, Math.max(0, current + delta));
};
