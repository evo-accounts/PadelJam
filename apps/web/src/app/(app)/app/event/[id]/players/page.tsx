'use client';
/**
 * The Player list (UX-JEVT-08), web's twin of mobile's `app/event/[id]/players.tsx` — reached from
 * the chevron on the event page's Players card.
 *
 * The read-only counterpart of Manage players: tabs labelled with their counts — Confirmed
 * (n / capacity), Waiting list (only while the event has one), Invited (`event_invited_players`,
 * migration 0112, visible to anyone who can see the event — decision 14). A row opens that
 * player's profile; a guest (no account) carries a "Guest" tag and opens nothing, and so does a
 * manual invitee. A waiting pair is shown together, as it queues and claims as one unit. Nothing
 * here acts on a player. The grouping is `playerTabs` in `@padel/utils`, the one mobile reads.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, UserRoundCheck, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useEvent, useEventInvitedPlayers, useEventParticipants } from '@padel/api';
import { playerTabs, type PlayerRow } from '@padel/utils';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { avatarUrl } from '@/lib/upload';

type Tab = 'confirmed' | 'waiting' | 'invited';

function PlayerItem({ row }: { row: PlayerRow }) {
  const { t } = useT('event');
  const name = row.name ?? '—';
  const body = (
    <>
      <Avatar className="size-9">
        <AvatarImage src={avatarUrl(row.avatarPath) ?? undefined} alt="" />
        <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {row.standby ? <span className="text-xs text-muted-foreground">{t('playersListStandby')}</span> : null}
      </span>
      {row.guest ? (
        <Badge variant="secondary" data-testid={`event-player-guest-${row.key}`}>
          {t('guestTag')}
        </Badge>
      ) : row.profileId ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </>
  );
  return (
    <li data-testid={`event-player-${row.key}`}>
      {row.profileId ? (
        <Link
          href={`/app/profile/${row.profileId}`}
          className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2">{body}</div>
      )}
    </li>
  );
}

function Empty({ icon: Icon, title, body, testId }: { icon: typeof Users; title: string; body: string; testId: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"
      data-testid={testId}
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function EventPlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invited = useEventInvitedPlayers(id);
  const [picked, setPicked] = useState<Tab>('confirmed');

  const tabs = playerTabs(participants.data ?? [], invited.data ?? []);
  const e = event.data;
  const capacity = e ? e.num_courts * 4 + (e.allow_standby ? (e.standby_spots ?? 0) : 0) : 0;
  const hasWaiting = tabs.waiting.length > 0;
  // The waiting list can empty while its tab is open (a claim, a leave): fall back to Confirmed.
  const tab: Tab = picked === 'waiting' && !hasWaiting ? 'confirmed' : picked;

  const options: { value: Tab; label: string }[] = [
    { value: 'confirmed', label: t('playersTabConfirmed', { n: tabs.confirmed.length, capacity }) },
    ...(hasWaiting ? [{ value: 'waiting' as const, label: t('playersTabWaiting', { n: tabs.waitingCount }) }] : []),
    {
      value: 'invited',
      // No count until the list has loaded: "Invited (0)" would claim nobody is invited.
      label: invited.data ? t('playersTabInvited', { n: tabs.invited.length }) : t('playersTabInvitedPlain'),
    },
  ];

  // The event row gives the capacity in the Confirmed label: without it the count would read n/0.
  const failed = event.isError || participants.isError || (tab === 'invited' && invited.isError);
  const loading = event.isLoading || participants.isLoading || (tab === 'invited' && invited.isLoading);

  let body: React.ReactNode;
  if (failed) {
    body = (
      <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="event-players-error">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void event.refetch();
            void participants.refetch();
            void invited.refetch();
          }}
        >
          {t('retryCta')}
        </Button>
      </div>
    );
  } else if (loading) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (tab === 'confirmed' && tabs.confirmed.length === 0) {
    body = (
      <Empty
        icon={Users}
        title={t('playersListEmpty')}
        body={t('playersListEmptyBody')}
        testId="event-players-empty"
      />
    );
  } else if (tab === 'invited' && tabs.invited.length === 0) {
    body = (
      <Empty
        icon={UserRoundCheck}
        title={t('playersInvitedEmpty')}
        body={t('playersInvitedEmptyBody')}
        testId="event-players-invited-empty"
      />
    );
  } else if (tab === 'waiting') {
    body = (
      <ul className="flex flex-col gap-1" data-testid="event-players-waiting">
        {tabs.waiting.map((entry) =>
          entry.players.length > 1 ? (
            <li key={entry.key} data-testid={`event-player-pair-${entry.key}`}>
              <ul className="flex flex-col rounded-sm border-l-[3px] border-primary pl-2">
                {entry.players.map((p) => (
                  <PlayerItem key={p.key} row={p} />
                ))}
              </ul>
            </li>
          ) : (
            <PlayerItem key={entry.key} row={entry.players[0]!} />
          ),
        )}
      </ul>
    );
  } else {
    const rows = tab === 'confirmed' ? tabs.confirmed : tabs.invited;
    body = (
      <ul className="flex flex-col" data-testid={`event-players-${tab}`}>
        {rows.map((p) => (
          <PlayerItem key={p.key} row={p} />
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <GroupPageTitle title={t('playersListTitle')} fallbackHref={`/app/event/${id}`} />
      <Tabs value={tab} onValueChange={(v) => setPicked(v as Tab)}>
        {/* Three counted tabs overflow a 375px screen in Portuguese: the list scrolls sideways. */}
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {options.map((o) => (
            <TabsTrigger key={o.value} value={o.value} className="flex-none" data-testid={`event-players-tab-${o.value}`}>
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="pt-2">
          {body}
        </TabsContent>
      </Tabs>
    </div>
  );
}
