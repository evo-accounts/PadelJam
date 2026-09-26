'use client';
import { useDeferredValue, useState } from 'react';
import { MapPin, Plus, Search } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useVenueRegistry } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CourtCounter } from '../CourtCounter';
import {
  backToVenueList,
  chooseVenue,
  locationErrors,
  noLocation,
  openManualVenue,
  setManualCourtCount,
  setManualCourtName,
} from '../draft-logic';
import { InfoNote } from '../InfoNote';
import { VenueCard } from '../VenueCard';
import type { StepProps } from '../types';

/**
 * Location (UX-CEVT-06). Three ways to answer, as on mobile:
 *
 * 1. Pick a venue from the curated registry — every venue alphabetically, a page at a time, and
 *    the search narrows it. The card is the answer: clicking it advances to Courts.
 * 2. "Add manually" (or the action on "Location not found") opens the manual venue form: optional
 *    name, required address, 1–20 courts with optional names, and a note that the venue serves
 *    this event only. It has fields, so the wizard shows the primary button; Courts is skipped.
 * 3. "I don't want to add a location", fixed at the bottom (`NoLocationFooter`), advances to a
 *    Courts step with only the count.
 *
 * Not a map search and no geolocation.
 */
export function Step5Location(props: StepProps) {
  return props.draft.locationMode === 'manual' ? <ManualVenueForm {...props} /> : <VenueList {...props} />;
}

function VenueList({ draft, patch, advance }: StepProps) {
  const { t } = useT('event');
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query.trim());
  const venues = useVenueRegistry(term);
  const rows = venues.data?.pages.flat() ?? [];
  const manual = () => patch(openManualVenue(draft));

  let body: React.ReactNode;
  if (venues.isLoading) {
    body = (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[5.5rem]" />
        ))}
      </div>
    );
  } else if (venues.isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border p-4" data-testid="venue-list-error">
        <p className="text-sm font-medium">{t('venueListErrorTitle')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void venues.refetch()}>
          {t('venueRetry')}
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    // UX-GLOB-03: say what is missing and offer the way out — the manual form.
    body = (
      <div
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
        data-testid="empty-step5-venues"
      >
        <MapPin className="size-6 text-muted-foreground" aria-hidden />
        <p className="font-medium">{term ? t('venueNotFoundTitle') : t('venueListEmptyTitle')}</p>
        <p className="text-sm text-muted-foreground">{term ? t('venueNotFoundBody') : t('venueListEmptyBody')}</p>
        <Button type="button" className="mt-2" onClick={manual} data-testid="venue-empty-add-manually">
          {t('addVenueManually')}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2" aria-label={t('step5Title')}>
          {rows.map((v) => (
            <li key={v.id}>
              <VenueCard
                venue={v}
                selected={draft.venueId === v.id}
                onClick={() => {
                  const partial = chooseVenue(draft, v);
                  if (advance) advance(partial);
                  else patch(partial);
                }}
              />
            </li>
          ))}
        </ul>
        {venues.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            disabled={venues.isFetchingNextPage}
            aria-busy={venues.isFetchingNextPage || undefined}
            onClick={() => void venues.fetchNextPage()}
            data-testid="venue-load-more"
          >
            {t('venueLoadMore')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('venueSearchPlaceholder')}
          aria-label={t('venueSearchPlaceholder')}
          className="pl-9"
          data-testid="venue-search"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        className="-mt-2 self-start"
        onClick={manual}
        data-testid="venue-add-manually"
      >
        <Plus aria-hidden />
        {t('addVenueManually')}
      </Button>
      {body}
    </div>
  );
}

function ManualVenueForm({ draft, patch, flagged }: StepProps) {
  const { t } = useT('event');
  const errors = flagged ? locationErrors(draft) : [];
  const badAddress = errors.includes('manualLocationAddress');

  return (
    <div className="flex flex-col gap-4">
      <InfoNote text={t('manualVenueBanner')} testId="manual-venue-note" />

      <div className="space-y-2">
        <Label htmlFor="manual-venue-name">{t('manualVenueNameLabel')}</Label>
        <Input
          id="manual-venue-name"
          value={draft.manualLocationName ?? ''}
          onChange={(e) => patch({ manualLocationName: e.target.value })}
          placeholder={t('locationNamePlaceholder')}
          maxLength={80}
          data-testid="manual-venue-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-venue-address">
          {t('locationAddressLabel')}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id="manual-venue-address"
          value={draft.manualLocationAddress ?? ''}
          onChange={(e) => patch({ manualLocationAddress: e.target.value })}
          placeholder={t('locationAddressPlaceholder')}
          maxLength={200}
          required
          aria-invalid={badAddress || undefined}
          aria-describedby={badAddress ? 'manual-venue-address-error' : undefined}
          data-testid="manual-venue-address"
        />
        {badAddress ? (
          <p id="manual-venue-address-error" className="text-sm text-destructive">
            {t('manualAddressRequired')}
          </p>
        ) : null}
      </div>

      <CourtCounter
        value={draft.numCourts}
        onChange={(n) => patch(setManualCourtCount(draft, n))}
        invalid={errors.includes('numCourts')}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('courtNamesLabel')}</legend>
        {Array.from({ length: draft.numCourts }, (_, i) => (
          <Input
            key={i}
            value={draft.manualCourtNames?.[i] ?? ''}
            onChange={(e) => patch(setManualCourtName(draft, i, e.target.value))}
            placeholder={t('courtNamePlaceholder', { number: i + 1 })}
            aria-label={t('courtNameA11y', { number: i + 1 })}
            maxLength={40}
            data-testid={`manual-court-name-${i + 1}`}
          />
        ))}
      </fieldset>

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => patch(backToVenueList())}
        data-testid="venue-back-to-list"
      >
        {t('chooseFromVenueList')}
      </Button>
    </div>
  );
}

/** Scenario 3, fixed at the bottom of the registry list; absent on the manual form. */
export function NoLocationFooter({ draft, advance }: StepProps) {
  const { t } = useT('event');
  if (draft.locationMode === 'manual' || !advance) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => advance(noLocation())}
      data-testid="venue-no-location"
    >
      {t('noLocationCta')}
    </Button>
  );
}
