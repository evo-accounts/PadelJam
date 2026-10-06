'use client';
import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { LocationPoint } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { searchableQuery, searchPlaces, shortLabel, type GeocodeResult } from '@/lib/geocode';

/** What picking a result hands back: the short label to keep and the place's point. */
export type PickedResult = { label: string; point: LocationPoint };

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: GeocodeResult[] }
  | { status: 'error' };

/**
 * Address lookup on web, shared by the community place picker, the create-event manual address
 * and the profile location editor. Search runs on an explicit press (the Search button, or Enter
 * in the owner's input via `search`) — never as you type: Nominatim, behind the `geocode` edge
 * function, forbids autocomplete. Results carry the OSM attribution the ODbL requires.
 *
 * Split in a hook and two pieces so the owner can put the button beside its own input and the
 * results under it: `const s = usePlaceSearch()`, then `<PlaceSearchButton search={s} query=… />`
 * and `<PlaceSearchResults search={s} onPick=… />`.
 */
export function usePlaceSearch() {
  const { i18n } = useT('community');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  // Only the latest search may land: an older, slower answer must not replace a newer one.
  const latest = useRef(0);
  const search = async (raw: string) => {
    const q = searchableQuery(raw);
    if (!q) return;
    const id = ++latest.current;
    setState({ status: 'loading' });
    try {
      const results = await searchPlaces(q, i18n.language || 'en');
      if (id === latest.current) setState({ status: 'done', results });
    } catch {
      if (id === latest.current) setState({ status: 'error' });
    }
  };
  const close = () => {
    latest.current++;
    setState({ status: 'idle' });
  };
  return { state, search, close };
}

export type PlaceSearchController = ReturnType<typeof usePlaceSearch>;

/** Enter in the owner's text input runs the search instead of submitting the form. */
export function searchOnEnter(search: PlaceSearchController, query: string) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void search.search(query);
  };
}

export function PlaceSearchButton({
  search,
  query,
  testIdPrefix = 'place-picker',
}: {
  search: PlaceSearchController;
  query: string;
  testIdPrefix?: string;
}) {
  const { t } = useT('community');
  return (
    <Button
      type="button"
      variant="secondary"
      loading={search.state.status === 'loading'}
      disabled={!searchableQuery(query)}
      onClick={() => void search.search(query)}
      data-testid={`${testIdPrefix}-search`}
    >
      <Search aria-hidden />
      {t('locationSearch')}
    </Button>
  );
}

export function PlaceSearchResults({
  search,
  onPick,
  focusAfterPickId,
  testIdPrefix = 'place-picker',
}: {
  search: PlaceSearchController;
  onPick: (picked: PickedResult) => void;
  /** The input to return focus to once the list closes, so focus does not fall to the page. */
  focusAfterPickId?: string;
  testIdPrefix?: string;
}) {
  const { t } = useT('community');
  const { state } = search;
  if (state.status === 'error') {
    return (
      <p className="text-xs text-destructive" role="alert" data-testid={`${testIdPrefix}-search-error`}>
        {t('locationSearchFailed')}
      </p>
    );
  }
  if (state.status !== 'done') return null;
  if (state.results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" role="status" data-testid={`${testIdPrefix}-no-results`}>
        {t('locationSearchNoResults')}
      </p>
    );
  }
  const pick = (r: GeocodeResult) => {
    onPick({ label: shortLabel(r.label), point: { lat: r.lat, lng: r.lng } });
    search.close();
    if (focusAfterPickId) document.getElementById(focusAfterPickId)?.focus();
  };
  return (
    <div className="space-y-1">
      <ul
        role="list"
        aria-label={t('locationResultsLabel')}
        className="flex flex-col overflow-hidden rounded-md border"
        data-testid={`${testIdPrefix}-results`}
      >
        {state.results.map((r, i) => (
          <li key={`${r.lat},${r.lng},${i}`} className="border-b last:border-b-0">
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
              onClick={() => pick(r)}
              data-testid={`${testIdPrefix}-result-${i}`}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t('osmAttribution')}
        </a>
      </p>
    </div>
  );
}
