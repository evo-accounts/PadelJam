'use client';
/** The venue registry: search, list (alphabetical, paged), and the way into create/edit. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { useAdminVenues } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { venueImageUrl } from '@/lib/upload';

export default function VenuesPage() {
  const { t } = useT('superAdmin');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const venues = useAdminVenues(term);
  const rows = venues.data?.pages.flat() ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold">{t('venuesTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('venuesSubtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/super-admin/venues/new">
            <Plus />
            {t('newVenue')}
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          className="pl-9"
        />
      </div>

      {venues.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : venues.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border p-4">
          <p className="text-sm">{t('loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void venues.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          {term ? t('noResults') : t('noVenues')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="super-admin-venue-list">
          {rows.map((v) => {
            const img = venueImageUrl(v.image_path);
            return (
              <li key={v.id}>
                <Link
                  href={`/super-admin/venues/${v.id}`}
                  className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden>
                      <MapPin className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{v.name}</span>
                    {v.address ? <span className="truncate text-sm text-muted-foreground">{v.address}</span> : null}
                    <span className="text-xs text-muted-foreground">{t('courtCount', { count: v.court_count })}</span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {venues.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={venues.isFetchingNextPage}
          onClick={() => void venues.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
