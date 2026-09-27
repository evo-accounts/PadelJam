'use client';
/**
 * The building blocks of the web event page (UX-JEVT-02..07) — web's twin of mobile's
 * `components/event/EventDetailParts.tsx`. Every event state reuses this body and changes only the
 * top banner and the bottom area, so the pieces live here and the page only decides which to show.
 */
import Link from 'next/link';
import { ChevronRight, Lock, MapPin, X } from 'lucide-react';
import { useT } from '@padel/i18n';
import { mapsWebUrl, type BannerState, type EventPlace } from '@padel/utils';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useIsAppleDevice } from '@/lib/eventLinks';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { EventThumb } from './EventThumb';

export type PersonLite = { id: string; full_name: string | null; avatar_url: string | null };

/** `Sat, 3 Oct · 18:30` in the app's language. */
export function eventWhen(iso: string, lang: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

/** The title's subtitle: date · time · place. */
export function eventSubtitle(iso: string, placeName: string | null | undefined, lang: string): string {
  return [eventWhen(iso, lang), placeName].filter(Boolean).join(' · ');
}

const rowCard =
  'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50';

function initials(name: string | null | undefined): string {
  return (name ?? '?').slice(0, 2).toUpperCase();
}

/** Three overlapping confirmed-player photos, "Players", and confirmed / capacity; opens the list. */
export function PlayersCard({
  people,
  confirmed,
  capacity,
  href,
}: {
  people: { id: string; name: string | null; avatarPath: string | null }[];
  confirmed: number;
  capacity: number;
  href: string;
}) {
  const { t } = useT('event');
  const shown = people.slice(0, 3);
  return (
    <Link href={href} className={rowCard} data-testid="event-players-card">
      {shown.length > 0 ? (
        <AvatarGroup>
          {shown.map((p) => (
            <Avatar key={p.id} className="size-9 ring-2 ring-card">
              <AvatarImage src={avatarUrl(p.avatarPath) ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{t('playersTitle')}</span>
        <span className="text-sm text-muted-foreground">{t('playersCapacity', { confirmed, capacity })}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Courts / Scoring / Fee side by side. Read-only for everyone, the organizer included. */
export function InfoWidgets({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2" data-testid="event-widgets">
      {items.map((w) => (
        <div key={w.label} className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3">
          <dt className="truncate text-xs text-muted-foreground">{w.label}</dt>
          <dd className="line-clamp-2 text-sm font-medium break-words">{w.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Photo, name, a caption and — with `href` — a chevron to their profile. */
export function PersonCard({
  person,
  caption,
  href,
  testId,
}: {
  person: PersonLite;
  caption: string;
  href?: string;
  testId?: string;
}) {
  const name = person.full_name ?? '—';
  const body = (
    <>
      <Avatar className="size-10">
        <AvatarImage src={avatarUrl(person.avatar_url) ?? undefined} alt="" />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">{caption}</span>
      </span>
      {href ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  return href ? (
    <Link href={href} className={rowCard} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cn(rowCard, 'hover:bg-card')} data-testid={testId}>
      {body}
    </div>
  );
}

/** Venue name and address; opens Apple Maps or Google Maps in a new tab. */
export function LocationCard({ place }: { place: EventPlace }) {
  const apple = useIsAppleDevice();
  return (
    <a
      href={mapsWebUrl(place, apple)}
      target="_blank"
      rel="noopener noreferrer"
      className={rowCard}
      data-testid="event-location-card"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <MapPin className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{place.name}</span>
        {place.address ? <span className="line-clamp-2 text-sm text-muted-foreground">{place.address}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

/**
 * The strip under the header: "You are going", stand-by, the waiting-list explanation, or — for a
 * team-event player looking for a partner — "You are interested" (UX-JEVT-13).
 */
export function StateBanner({ state }: { state: Exclude<BannerState, null> }) {
  const { t } = useT('event');
  const waiting = state === 'waiting_list';
  const title =
    state === 'going'
      ? t('goingBanner')
      : state === 'standby'
        ? t('standbyBadge')
        : state === 'interested'
          ? t('interestedBanner')
          : t('waitlistBannerTitle');
  return (
    <div
      role="status"
      data-testid={`event-banner-${state}`}
      className={cn(
        'rounded-xl p-3',
        waiting
          ? 'bg-warning text-warning-foreground'
          : state === 'interested'
            ? 'bg-info text-info-foreground'
            : 'bg-success text-success-foreground',
      )}
    >
      <p className="font-medium">{title}</p>
      {waiting ? <p className="mt-1 text-sm opacity-90">{t('waitlistBannerBody')}</p> : null}
    </div>
  );
}

/**
 * Past the 12h leave deadline (UX-JEVT-05): no self-leave, only the organizer and a way to reach
 * them. Chat only — decision 2 drops "Call" (phones stop being readable by other users).
 */
export function LeaveLockedDialog({
  open,
  onClose,
  organizer,
  onChat,
  chatBusy,
}: {
  open: boolean;
  onClose: () => void;
  organizer: PersonLite | null;
  onChat: () => void;
  chatBusy: boolean;
}) {
  const { t } = useT('event');
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent data-testid="leave-locked-dialog">
        <DialogHeader>
          <DialogTitle>{t('leaveLockedTitle')}</DialogTitle>
          <DialogDescription>{t('leaveLockedSheetBody')}</DialogDescription>
        </DialogHeader>
        {organizer ? (
          <PersonCard person={organizer} caption={t('organizerLabel')} href={`/app/profile/${organizer.id}`} />
        ) : null}
        <DialogFooter>
          <Button className="w-full" disabled={chatBusy || organizer == null} onClick={onChat} data-testid="leave-locked-chat">
            {t('chatCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The other half of the viewer's team, for the "You are going" dialog (UX-JEVT-10). */
export type JoinedPartner = { key: string; name: string | null; avatarPath: string | null; guest: boolean };

/**
 * "You are in" (UX-JEVT-03), after accepting an invitation or joining with a confirmed spot: the
 * event image, the message, date · time · place, Add to calendar (downloads an .ics) and Close.
 * Close returns to the event page, which now shows the "You are going" banner.
 *
 * On a team event (UX-JEVT-10, after choosing a partner) it is the "You are going" variant and
 * shows the partner's photo and name — a guest partner included.
 */
export function JoinedDialog({
  open,
  onClose,
  thumbnailPath,
  name,
  subtitle,
  onCalendar,
  team = false,
  partner = null,
}: {
  open: boolean;
  onClose: () => void;
  thumbnailPath: string | null;
  name: string;
  subtitle: string;
  onCalendar: () => void;
  team?: boolean;
  partner?: JoinedPartner | null;
}) {
  const { t } = useT('event');
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent showCloseButton={false} data-testid="event-joined-dialog">
        <EventThumb path={thumbnailPath} shape="hero" />
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-2xl">{team ? t('goingBanner') : t('youAreInTitle')}</DialogTitle>
          {partner ? (
            <div className="flex flex-col items-center gap-2 py-1" data-testid="event-joined-partner">
              <Avatar className="size-14">
                <AvatarImage src={avatarUrl(partner.avatarPath) ?? undefined} alt="" />
                <AvatarFallback>{initials(partner.name)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{partner.name ?? '—'}</span>
              {partner.guest ? <Badge variant="secondary">{t('guestTag')}</Badge> : null}
            </div>
          ) : null}
          <DialogDescription asChild>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{name}</span>
              <span>{subtitle}</span>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={onCalendar} data-testid="event-joined-calendar">
            {t('addToCalendarAction')}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="event-joined-close">
            {t('closeCta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * No access (UX-JEVT-07). RLS hides a private event and a deleted one the same way, so both land
 * here. ✕ goes Home, not back: this page is usually reached from a link, with nothing to go back to.
 */
export function EventNoAccess() {
  const { t } = useT('event');
  return (
    <div className="flex min-h-[70vh] flex-col" data-testid="event-no-access">
      <div className="flex justify-end px-4 py-3">
        <Button asChild variant="ghost" size="icon" aria-label={t('closeCta')}>
          <Link href="/app">
            <X />
          </Link>
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{t('noAccessTitle')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t('noAccessBody')}</p>
      </div>
    </div>
  );
}
