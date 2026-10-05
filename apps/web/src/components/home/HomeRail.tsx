'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * One overview section on Home (UX-HOME-01): a title with "See all", then vertical cards in a row
 * that scrolls sideways (UX-GLOB-09) — or, with nothing to show, the section's empty state.
 *
 * The row bleeds to the page edge so a half-visible last card shows it scrolls.
 */
export function HomeRail({
  id,
  title,
  seeAllHref,
  testId,
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  id: string;
  title: string;
  seeAllHref: string;
  testId: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Rendered instead of the row when there is nothing in it. */
  empty: ReactNode | null;
  children: ReactNode;
}) {
  const { t } = useT('home');
  const { t: tc } = useT('common');
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby={id} data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <Link href={seeAllHref} className="text-sm font-medium text-primary hover:underline" data-testid={`${testId}-see-all`}>
          {t('seeAll')}
        </Link>
      </div>
      {loading ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6">
          <Skeleton className="h-48 w-60 shrink-0 rounded-xl" />
          <Skeleton className="h-48 w-60 shrink-0 rounded-xl" />
          <Skeleton className="h-48 w-60 shrink-0 rounded-xl" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-2" role="alert" data-testid={`${testId}-error`}>
          <p className="text-sm text-muted-foreground">{tc('loadError')}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {tc('retry')}
          </Button>
        </div>
      ) : empty ? (
        empty
      ) : (
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6" data-testid={`${testId}-rail`}>
          {children}
        </div>
      )}
    </section>
  );
}
