'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import type { SearchResults } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type SearchQuery<T> = UseInfiniteQueryResult<SearchResults<T>>;

/** One applied filter as a removable chip (UX-EXPL-07). */
export type AppliedChip = { key: string; label: string; onRemove: () => void };

/**
 * The top of a typed result tab (UX-EXPL-07): the result count on the left and the filter control
 * on the right, then the applied filters as chips with ✕ in a row that scrolls sideways — and is
 * not there at all when nothing is applied.
 */
export function ResultsHeader({
  count,
  loading,
  appliedCount,
  onFilter,
  chips,
  testId,
}: {
  count: number;
  loading: boolean;
  appliedCount: number;
  onFilter: () => void;
  chips: AppliedChip[];
  testId: string;
}) {
  const { t } = useT('explore');
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {loading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <p className="text-sm font-medium" aria-live="polite" data-testid={`${testId}-count`}>
            {t('resultCount', { count })}
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={onFilter} data-testid={`${testId}-filter`}>
          <SlidersHorizontal aria-hidden />
          {t('filter')}
          {appliedCount > 0 ? (
            <span
              className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
              aria-label={t('filtersApplied', { count: appliedCount })}
            >
              {appliedCount}
            </span>
          ) : null}
        </Button>
      </div>
      {chips.length > 0 ? (
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" aria-label={t('appliedFilters')} data-testid={`${testId}-chips`}>
          {chips.map((chip) => (
            <li key={chip.key} className="shrink-0">
              <span className="inline-flex h-8 items-center gap-1 rounded-full border bg-card pr-1 pl-3 text-sm whitespace-nowrap">
                {chip.label}
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={t('removeFilter', { label: chip.label })}
                  onClick={chip.onRemove}
                  data-testid={`${testId}-chip-remove`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A typed tab's rows: full-width horizontal cards, the next page loading as the end scrolls into
 * view (with "Load more" for when the observer cannot fire), the standard empty state when there
 * is nothing. While a new query loads, the previous rows stay, dimmed.
 */
export function ResultsList<T extends { id: string }>({
  query,
  renderRow,
  empty,
  testId,
}: {
  query: SearchQuery<T>;
  renderRow: (row: T) => ReactNode;
  empty: ReactNode;
  testId: string;
}) {
  const { t } = useT('explore');
  const { t: tc } = useT('common');
  const { data, isLoading, isError, isPlaceholderData, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[70px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError && !data) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert" data-testid={`${testId}-error`}>
        <p className="text-sm text-muted-foreground">{t('searchError')}</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          {tc('retry')}
        </Button>
      </div>
    );
  }

  // A refetch after an action can shift a row from one page into the next; list it once.
  const seen = new Set<string>();
  const rows = (data?.items ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', isPlaceholderData && 'opacity-60')} data-testid={testId}>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>{renderRow(row)}</li>
        ))}
      </ul>
      {hasNextPage ? (
        <div ref={sentinel} className="flex justify-center py-2">
          <Button variant="secondary" size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()} data-testid={`${testId}-more`}>
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
