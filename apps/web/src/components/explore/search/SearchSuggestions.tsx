'use client';
import { Building2, CalendarDays, ChevronRight, Search, UserRound, Users } from 'lucide-react';
import { useSearchSuggest, type SearchSuggestionKind } from '@padel/api';
import { useT } from '@padel/i18n';

const KIND_ICON = { player: UserRound, event: CalendarDays, community: Building2, group: Users } as const;
const KIND_LABEL: Record<SearchSuggestionKind, string> = {
  player: 'kindPlayer',
  event: 'kindEvent',
  community: 'kindCommunity',
  group: 'kindGroup',
};

/**
 * Typeahead (UX-EXPL-05, D7): up to 8 names matching what is typed, each a row with a chevron.
 * The caller passes the debounced text, so the list follows each keystroke without a request per
 * key; the previous list stays up while the next loads. Tapping a row runs the full search for
 * that name. The first row always runs exactly what was typed, so Enter has a visible twin.
 */
export function SearchSuggestions({
  typed,
  debounced,
  onRun,
}: {
  /** What is in the input right now — the first row runs exactly this. */
  typed: string;
  /** The same text, debounced: what the suggestions are fetched for. */
  debounced: string;
  onRun: (q: string) => void;
}) {
  const { t } = useT('explore');
  const text = typed.trim();
  const suggest = useSearchSuggest(debounced);
  const rows = (suggest.data ?? []).filter((s) => s.label.toLocaleLowerCase() !== text.toLocaleLowerCase());

  const rowClass =
    'flex w-full items-center gap-3 rounded-md px-1 py-3 text-left text-sm hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

  return (
    <ul className="flex flex-col" aria-label={t('suggestionsLabel')} data-testid="explore-suggestions">
      <li className="border-b">
        <button type="button" className={rowClass} onClick={() => onRun(text)} data-testid="explore-suggestion-typed">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t('searchFor', { q: text })}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </li>
      {rows.map((s) => {
        const Icon = KIND_ICON[s.kind];
        return (
          <li key={`${s.kind}:${s.id}`} className="border-b last:border-b-0">
            <button
              type="button"
              className={rowClass}
              onClick={() => onRun(s.label)}
              aria-label={`${s.label} · ${t(KIND_LABEL[s.kind])}`}
              data-testid="explore-suggestion-row"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
