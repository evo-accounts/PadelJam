/**
 * Explore's recent searches (UX-EXPL-04, D5): kept on this device only (AsyncStorage), never
 * synced. Keyed per user, so two accounts on one phone do not see each other's queries. Storage
 * failures are ignored — a lost list only means the block is hidden.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addRecent, parseRecents } from './recentSearchesRule';

const key = (uid: string) => `explore-recent-searches:${uid}`;
const EMPTY: string[] = [];

function write(uid: string, list: string[]) {
  const op = list.length === 0 ? AsyncStorage.removeItem(key(uid)) : AsyncStorage.setItem(key(uid), JSON.stringify(list));
  op.catch(() => undefined);
}

export function useRecentSearches(uid: string | undefined) {
  // Held with the user it belongs to, so a switch of account never shows the previous one's list.
  const [state, setState] = useState<{ uid: string | undefined; list: string[] }>({ uid: undefined, list: [] });
  const list = state.uid === uid ? state.list : EMPTY;
  // A change made before the stored list arrives wins over it.
  const touched = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    AsyncStorage.getItem(key(uid))
      .then((raw) => {
        if (!cancelled && touched.current !== uid) setState({ uid, list: parseRecents(raw) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const update = useCallback(
    (next: (list: string[]) => string[]) => {
      if (!uid) return;
      touched.current = uid;
      setState((s) => {
        const updated = next(s.uid === uid ? s.list : EMPTY);
        write(uid, updated);
        return { uid, list: updated };
      });
    },
    [uid],
  );

  const add = useCallback((term: string) => update((l) => addRecent(l, term)), [update]);
  const remove = useCallback((term: string) => update((l) => l.filter((t) => t !== term)), [update]);
  const clear = useCallback(() => update(() => []), [update]);

  return { recents: list, add, remove, clear };
}
