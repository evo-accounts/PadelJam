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
