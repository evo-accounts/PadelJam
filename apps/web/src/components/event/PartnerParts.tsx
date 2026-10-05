'use client';
/**
 * Shared pieces of the web partner pages (UX-JEVT-10..12): the page frame with its sticky bottom
 * bar, a player row's avatar, and the standard empty state (UX-GLOB-03).
 */
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { useEvent } from '@padel/api';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export function PlayerAvatar({ name, path }: { name: string | null; path: string | null }) {
  return (
    <Avatar className="size-10">
      <AvatarImage src={avatarUrl(path) ?? undefined} alt="" />
      <AvatarFallback className="text-xs">{(name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function EmptyBlock({
  icon: Icon,
  title,
  body,
  action,
  tone,
  testId,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: 'error';
  testId: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"
      role={tone === 'error' ? 'alert' : undefined}
      data-testid={testId}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground" aria-hidden /> : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/** Back to the event: the previous page when there is one (it is the event), else the event itself. */
export function useBackToEvent(eventId: string): () => void {
  const router = useRouter();
  return () => (window.history.length > 1 ? router.back() : router.replace(`/app/event/${eventId}`));
}

/**
 * The frame of a partner page: back · title · subtitle, the head (search), the scrolling list, and
 * a sticky bottom bar. A stale link to a non-team event goes to the event instead — there is no
 * partner to find there.
 */
export function PartnerPageFrame({
  eventId,
  title,
  subtitle,
  head,
  bottom,
  error,
  children,
}: {
  eventId: string;
  title: string;
  subtitle: string;
  head: ReactNode;
  bottom: ReactNode;
  /** An action that failed, shown above the bottom bar's buttons (the mobile banner's copy). */
  error: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const { data: event } = useEvent(eventId);
  const notTeam = event != null && event.specification !== 'team';
  useEffect(() => {
    if (notTeam) router.replace(`/app/event/${eventId}`);
  }, [notTeam, router, eventId]);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
      <GroupPageTitle title={title} fallbackHref={`/app/event/${eventId}`} subtitle={event?.name} />
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      {head}
      <div className="flex flex-col gap-1 pb-4">{children}</div>
      <div
        className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t bg-card px-4 pt-3 pb-4 sm:-mx-6 sm:px-6"
        data-testid="partner-bottom-bar"
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="partner-error">
            {error}
          </p>
        ) : null}
        {bottom}
      </div>
    </div>
  );
}
