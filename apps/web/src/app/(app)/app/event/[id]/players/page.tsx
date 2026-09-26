'use client';
/**
 * Players of an event — the destination of the Players card's chevron (UX-JEVT-02).
 *
 * MINIMAL on purpose, like mobile's M4a screen: confirmed players, then stand-by, each opening
 * their profile; a team event also lists its teams. M4b / W2 part 2 rebuild this as the read-only
 * Player list of UX-JEVT-08 — tabs (Confirmed / Waiting list / Invited) through
 * `event_invited_players` (migration 0112) and the guest tag.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useEventParticipants, useEventTeams } from '@padel/api';
import { EventParticipantsList, type EventTeam } from '@/components/event/EventParticipantsList';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function EventPlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);

  const confirmed = (participants.data ?? []).filter((p) => p.status === 'confirmed');
  const sections = [
    { key: 'confirmed', title: t('playersListConfirmed'), rows: confirmed.filter((p) => !p.is_standby) },
    { key: 'standby', title: t('playersListStandby'), rows: confirmed.filter((p) => p.is_standby) },
  ].filter((s) => s.rows.length > 0);
  const teamRows = (teams.data ?? []) as EventTeam[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <GroupPageTitle title={t('playersListTitle')} fallbackHref={`/app/event/${id}`} />
      {participants.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : sections.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
          data-testid="event-players-empty"
        >
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{t('playersListEmpty')}</p>
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-muted-foreground">{s.title}</h2>
            <ul className="flex flex-col">
              {s.rows.map((p) => {
                const name = p.profiles?.full_name ?? p.guest_name ?? '—';
                const profileId = p.profiles?.id ?? null;
                const body = (
                  <>
                    <Avatar className="size-9">
                      <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} alt="" />
                      <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm font-medium">{name}</span>
                    {profileId ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden /> : null}
                  </>
                );
                return (
                  <li key={p.id} data-testid={`event-player-${p.id}`}>
                    {profileId ? (
                      <Link
                        href={`/app/profile/${profileId}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {teamRows.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('teamsTitle')}</h2>
          <EventParticipantsList participants={[]} teams={teamRows} />
        </section>
      ) : null}
    </div>
  );
}
