'use client';
import { Building2, CalendarDays, Clock, MapPin, X } from 'lucide-react';
import { useSearchForYouTerms, type ForYouTerm } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const FORMAT_LABEL: Record<string, string> = {
  americano: 'formatAmericano',
  mexicano: 'formatMexicano',
  up_and_down: 'formatUpDown',
};

const TERM_ICON = { city: MapPin, format: CalendarDays, community: Building2 } as const;

/**
 * Search with the input active and empty (UX-EXPL-04): "For you" chips that wrap, then the
 * viewer's recent searches — clock, the query, ✕ — with "Clear all". Each block is hidden when it
 * has nothing in it (D5, D6).
 */
export function SearchStart({
  recents,
  onRunTerm,
  onRunQuery,
  onRemoveRecent,
  onClearRecents,
}: {
  recents: readonly string[];
  onRunTerm: (term: ForYouTerm) => void;
  onRunQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearRecents: () => void;
}) {
  const { t } = useT('explore');
  const forYou = useSearchForYouTerms();
  const terms = forYou.data ?? [];
  const label = (term: ForYouTerm) =>
    term.kind === 'format' ? t(FORMAT_LABEL[term.value] ?? 'formatAmericano') : term.value;

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="explore-search-start">
      {forYou.isLoading ? (
        <div className="flex flex-wrap gap-2" aria-hidden>
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      ) : terms.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="explore-for-you-title" data-testid="explore-for-you">
          <h2 id="explore-for-you-title" className="text-lg font-semibold">
            {t('forYouTitle')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {terms.map((term) => {
              const Icon = TERM_ICON[term.kind];
              return (
                <li key={`${term.kind}:${term.value}`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    onClick={() => onRunTerm(term)}
                    data-testid={`explore-for-you-${term.kind}-${term.value}`}
                  >
                    <Icon aria-hidden />
                    {label(term)}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recents.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="explore-recents-title" data-testid="explore-recents">
          <div className="flex items-center justify-between gap-3">
            <h2 id="explore-recents-title" className="text-lg font-semibold">
              {t('recentTitle')}
            </h2>
            <Button variant="tertiary" size="sm" onClick={onClearRecents} data-testid="explore-recents-clear">
              {t('recentClearAll')}
            </Button>
          </div>
          <ul className="flex flex-col">
            {recents.map((q) => (
              <li key={q} className="flex items-center gap-1 border-b last:border-b-0">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 text-left text-sm hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => onRunQuery(q)}
                  data-testid="explore-recent-row"
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{q}</span>
                </button>
                <Button
                  variant="tertiary"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={t('recentRemove', { q })}
                  onClick={() => onRemoveRecent(q)}
                  data-testid="explore-recent-remove"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!forYou.isLoading && terms.length === 0 && recents.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="explore-search-hint">
          {t('searchHint')}
        </p>
      ) : null}
    </div>
  );
}
