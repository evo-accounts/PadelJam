'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useGroup,
  useGroupMembers,
  useGroupSeasons,
  useMyGroups,
  useGroupRanking,
  useJoinGroup,
  useLeaveGroup,
  useGroupRealtime,
  useGroupEvents,
  useCanCreateEvent,
} from '@padel/api';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { RankingTable } from '@/components/group/RankingTable';
import { GroupMembersList } from '@/components/group/GroupMembersList';
import { SeasonsList } from '@/components/group/SeasonsList';
import { communityImageUrl } from '@/lib/community-images';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  useGroupRealtime(id);
  const group = useGroup(id);
  const members = useGroupMembers(id);
  const seasons = useGroupSeasons(id);
  const mine = useMyGroups();
  const join = useJoinGroup();
  const leave = useLeaveGroup();
  const [period, setPeriod] = useState<'all' | '3' | '6' | '12'>('all');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const currentSeason = seasons.data?.find((s) => s.ended_at === null) ?? seasons.data?.[0];
  const seasonId = selectedSeason ?? currentSeason?.id;
  const since =
    period === 'all'
      ? undefined
      : new Date(Date.now() - Number(period) * 30 * 24 * 3600 * 1000).toISOString();
  const ranking = useGroupRanking(seasonId ?? '', since);
  const events = useGroupEvents(id);
  const canCreateEvent = useCanCreateEvent(id);
  const { t } = useT('group');
  const { t: te } = useT('event');
  const myRow = mine.data?.find((r) => r.group_id === id);
  const isMember = !!myRow;
  const isManaging = !!myRow?.is_managing;
  const [err, setErr] = useState<string | null>(null);

  if (group.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!group.data) return <div className="p-6">{t('notAvailable')}</div>;

  const g = group.data;
  const thumbnail = communityImageUrl(g.thumbnail_path, 'community-thumbnails');
  const initials = (g.name ?? '?').slice(0, 2).toUpperCase();

  const rankingRows = (ranking.data ?? []).map((r) => ({
    name: r.name,
    avatarUrl: r.avatarUrl,
    points: r.points,
    events: r.eventsPlayed,
  }));

  let cta: React.ReactNode = null;
  if (isMember) {
    cta = (
      <Button
        variant="outline"
        onClick={() =>
          leave.mutate(
            { groupId: id, communityId: g.community_id },
            { onError: () => setErr(t('notAvailable')) },
          )
        }
      >
        {t('leave')}
      </Button>
    );
  } else if (!g.is_private) {
    cta = (
      <Button onClick={() => join.mutate({ groupId: id, communityId: g.community_id })}>
        {t('join')}
      </Button>
    );
  } else {
    cta = (
      <Button disabled variant="outline">
        {t('inviteOnly')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 rounded-lg">
            <AvatarImage src={thumbnail ?? undefined} />
            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="truncate text-xl font-semibold">{g.name}</h1>
            {g.description ? (
              <p className="text-sm text-muted-foreground">{g.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {t('memberCount', { count: members.data?.length ?? 0 })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {t('season', { n: currentSeason?.season_number ?? 1 })}
              </Badge>
              {g.archived_at ? <Badge variant="outline">{t('archived')}</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {cta}
          {isManaging ? (
            <Button asChild variant="outline">
              <Link href={`/app/group/${id}/manage`}>{t('manage')}</Link>
            </Button>
          ) : null}
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
        </div>
      </div>

      <div className="px-4">
        <Tabs defaultValue="ranking">
          <TabsList>
            <TabsTrigger value="ranking">{t('ranking')}</TabsTrigger>
            <TabsTrigger value="members">{t('members')}</TabsTrigger>
            <TabsTrigger value="seasons">{t('seasons')}</TabsTrigger>
            <TabsTrigger value="events">{t('events')}</TabsTrigger>
          </TabsList>

          <TabsContent value="ranking" className="flex flex-col gap-3 pt-4">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('periodAll')}</SelectItem>
                <SelectItem value="3">{t('period3')}</SelectItem>
                <SelectItem value="6">{t('period6')}</SelectItem>
                <SelectItem value="12">{t('period12')}</SelectItem>
              </SelectContent>
            </Select>
            <RankingTable rows={rankingRows} />
          </TabsContent>

          <TabsContent value="members" className="pt-4">
            <GroupMembersList members={members.data ?? []} />
          </TabsContent>

          <TabsContent value="seasons" className="pt-4">
            <SeasonsList
              seasons={seasons.data ?? []}
              selectedId={seasonId}
              onSelect={setSelectedSeason}
            />
          </TabsContent>

          <TabsContent value="events" className="flex flex-col gap-3 pt-4">
            {canCreateEvent.data === true ? (
              <Button asChild variant="outline" className="self-start">
                <Link href={`/app/community/${g.community_id}/event-create?groupId=${id}`}>
                  {te('newEventCta')}
                </Link>
              </Button>
            ) : null}
            {events.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (events.data ?? []).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">{t('comingSoon')}</p>
            ) : (
              (events.data ?? []).map((ev) => (
                <EventCard key={ev.id} event={ev as unknown as EventCardEvent} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
