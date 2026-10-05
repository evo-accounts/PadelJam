import type { QueryClient } from '@tanstack/react-query';
import type { PlayerViewerState } from '../discovery/queries';
import { qk } from '../query-keys';

type Row = { id: string; viewer_state?: string | null };
type Infinite = { pages: Row[][]; pageParams: unknown[] };

const patchRows = (rows: Row[], id: string, state: PlayerViewerState): Row[] => {
  let hit = false;
  const next = rows.map((r) => {
    if (r.id !== id || r.viewer_state === state) return r;
    hit = true;
    return { ...r, viewer_state: state };
  });
  return hit ? next : rows;
};

/**
 * One cached player query with `id`'s `viewer_state` set to `state`. Handles both shapes under
 * the `['explore','players']` prefix — the rail (an array) and the See-all / search lists
 * (infinite queries, `{ pages }`) — and returns the SAME reference when nothing changed, so
 * untouched queries do not re-render. Pure, so it is tested apart from React Query.
 */
export function withPlayerViewerState(data: unknown, id: string, state: PlayerViewerState): unknown {
  if (Array.isArray(data)) return patchRows(data as Row[], id, state);
  if (data && typeof data === 'object' && Array.isArray((data as Infinite).pages)) {
    const inf = data as Infinite;
    let hit = false;
    const pages = inf.pages.map((p) => {
      const next = patchRows(p, id, state);
      if (next !== p) hit = true;
      return next;
    });
    return hit ? { ...inf, pages } : data;
  }
  return data;
}

/**
 * Resolve a follow in place on every cached explore and search player row (D9, UX-EXPL-02).
 *
 * NOT an invalidation: 0128's rail leaves out people the viewer follows, so refetching it right
 * after a Follow made the card say "Following" for a moment and then vanish from under the tap.
 * The cards keep their resolved state instead, and the rail drops the followed player on its
 * next ordinary staleness refetch.
 */
export const setCachedPlayerViewerState = (qc: QueryClient, id: string, state: PlayerViewerState) =>
  qc.setQueriesData({ queryKey: qk.explorePlayers }, (data: unknown) => withPlayerViewerState(data, id, state));
