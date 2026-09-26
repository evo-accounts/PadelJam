'use client';
import { ChevronRight, MapPin } from 'lucide-react';
import { useT } from '@padel/i18n';
import type { VenueSearchRow } from '@padel/api';
import { venueImageUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';

/**
 * A registry venue in the Location step's list (UX-CEVT-06): image (or a placeholder), name,
 * address and number of courts. Horizontal, per UX-GLOB-09 — image left, text middle, chevron
 * right. The whole card is one button, so its name, address and court count are read together.
 */
export function VenueCard({
  venue,
  selected,
  onClick,
}: {
  venue: VenueSearchRow;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useT('event');
  const img = venueImageUrl(venue.image_path);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={`venue-card-${venue.id}`}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="size-16 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden>
          <MapPin className="size-5 text-muted-foreground" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{venue.name}</span>
        {venue.address ? (
          <span className="line-clamp-2 text-sm text-muted-foreground">{venue.address}</span>
        ) : null}
        <span className="text-xs text-muted-foreground">{t('venueCourtCount', { count: venue.court_count })}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
