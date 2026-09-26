'use client';
import { CalendarDays } from 'lucide-react';
import { eventThumbnailUrl } from '@/lib/community-images';
import { cn } from '@/lib/utils';

export type EventThumbShape = 'row' | 'hero';

const BOX: Record<EventThumbShape, string> = {
  row: 'size-14 rounded-lg',
  hero: 'aspect-[16/7] w-full rounded-xl sm:aspect-[16/6]',
};
const ICON: Record<EventThumbShape, string> = { row: 'size-6', hero: 'size-12' };

/**
 * An event's image, or an icon placeholder — never an empty grey block (UX-JEVT-01/02, B13:
 * `thumbnail_path` used to be uploaded and rendered nowhere). Web's twin of mobile's `EventThumb`.
 * Decorative: the event name is always beside or below it.
 */
export function EventThumb({
  path,
  shape,
  className,
}: {
  path: string | null | undefined;
  shape: EventThumbShape;
  className?: string;
}) {
  const src = eventThumbnailUrl(path);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn('shrink-0 bg-accent object-cover', BOX[shape], className)} />;
  }
  return (
    <div
      aria-hidden
      data-testid="event-thumb-placeholder"
      className={cn('flex shrink-0 items-center justify-center bg-accent text-primary', BOX[shape], className)}
    >
      <CalendarDays className={ICON[shape]} />
    </div>
  );
}
