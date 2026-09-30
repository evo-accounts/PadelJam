'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The body of a See-all screen (UX-EXPL-03): a vertical list of full-width horizontal cards that
 * loads the next page as its end scrolls into view — with a "Load more" button for when the
 * observer cannot fire (a short page, a keyboard user). The standard empty state when there is
 * nothing at all.
 */
export function SeeAllList<T extends { id: string }>({
  query,
  renderRow,
  empty,
  testId,
}: {
  query: UseInfiniteQueryResult<InfiniteData<T[]>>;
  renderRow: (row: T) => ReactNode;
  empty: ReactNode;
  testId: string;
}) {
  const { t } = useT('explore');
  const { t: tc } = useT('common');
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
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
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert" data-testid={`${testId}-error`}>
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          {tc('retry')}
        </Button>
      </div>
    );
  }

  // A refetch after an action can shift a row from one page into the next; list it once.
  const seen = new Set<string>();
  const rows = (data?.pages.flat() ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
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
