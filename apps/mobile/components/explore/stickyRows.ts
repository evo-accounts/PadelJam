/**
 * Keeps a card the viewer just acted on where it was, with its resolved state (D9, UX-EXPL-02).
 *
 * The explore rails exclude what the viewer already has — people they follow, communities they
 * belong to or asked to join, groups they are in — and every card action invalidates the rail.
 * So the refetch that follows a tap on Follow would pull that very card out from under the finger
 * a moment after it said "Following". Instead, an acted-on row is remembered with the index it
 * sat at and put back there while the screen stays focused; the next visit shows the fresh rail.
 *
 * Pure, so the merge rule is tested apart from React.
 */

/** What a card resolved to in this visit. `joined` is local-only: the server says `member`. */
export type ResolvedState = 'following' | 'requested' | 'joined';

export type StickyEntry<T> = { row: T; index: number; state: ResolvedState };

export function withSticky<T extends { id: string }>(
  rows: readonly T[],
  sticky: Readonly<Record<string, StickyEntry<T>>>,
): T[] {
  const present = new Set(rows.map((r) => r.id));
  const missing = Object.values(sticky)
    .filter((s) => !present.has(s.row.id))
    .sort((a, b) => a.index - b.index);
  if (missing.length === 0) return rows as T[];
  const out = [...rows];
  for (const s of missing) out.splice(Math.min(s.index, out.length), 0, s.row);
  return out;
}
