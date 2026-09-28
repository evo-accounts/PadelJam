'use client';
/**
 * The group page (UX-GRP-04) — web's twin of mobile's `app/group/[id]/index.tsx`. For a community
 * member who has not joined a public group it is also the preview (UX-GRP-02: all content
 * visible, "Join group" fixed at the bottom). An archived group opens read-only, with "Unarchive
 * group" fixed at the bottom for its admins (UX-GRP-03).
 *
 * The four tabs are gone. One page, top to bottom: the compact header with the viewer's menu
 * (GroupMenu: "⋯" for members, a settings icon for admins), one line of avatars + player count +
 * "+ Invite members", the upcoming events, the top-10 ranking, past seasons, and general info.
 * There is no chat button on the page any more — "Open chat" is a menu row (decision 4).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  useCanCreateEvent,
  useCanInviteToGroup,
  useCommunities,
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupEvents,
  useGroupMemberList,
  useGroupRanking,
  useGroupRealtime,
  useGroupSeasons,
  useJoinGroup,
  useUnarchiveGroup,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { AvatarStack } from '@/components/group/AvatarStack';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupHeader } from '@/components/group/GroupHeader';
import { GroupMenu } from '@/components/group/GroupMenu';
import { GroupThumb } from '@/components/group/GroupThumb';
import { RankingTable, sortRanking, type RankingSort } from '@/components/group/RankingTable';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { markSeasonSeen, seasonToAnnounce, useLastSeenSeason } from '@/lib/seasonNotice';

const PREVIEW_ROWS = 10;

export default function GroupPage() {
  const { t, i18n } = useT('group');
  const { t: tc } = useT('community');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  useGroupRealtime(id);

  const { data: group, isLoading } = useGroup(id);
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);
  const { data: memberships } = useCommunities();
  const { data: people } = useGroupMemberList(id);
  const { data: seasons } = useGroupSeasons(id);
  const { data: events } = useGroupEvents(id);
  const { data: canCreateEvent } = useCanCreateEvent(id);
  const { data: canInvite } = useCanInviteToGroup(id);

  const currentSeason = (seasons ?? []).find((s) => s.ended_at == null);
  const pastSeasons = (seasons ?? []).filter((s) => s.ended_at != null);
  const { data: ranking } = useGroupRanking(currentSeason?.id ?? '');
  const [sort, setSort] = useState<RankingSort>('points');
  // Fixed at mount: "upcoming" is relative to when the page opened (React Compiler purity).
  const [now] = useState(() => Date.now());

  const members = (people ?? []).filter((p) => p.is_member);
  const isMember = members.some((p) => p.user_id === uid);
  const isCommunityAdmin = (communityMembers ?? []).some((m) => m.user_id === uid && m.role === 'admin');
  // is_group_admin, read client-side: community admin, and for a private group also a member
  // (decision 1 — private groups stay private from admins who are not in them).
  const isAdmin = isCommunityAdmin && (!group?.is_private || isMember);
  const isArchived = !!group?.archived_at;
  const memberIds = new Set(members.map((m) => m.user_id));
  const eligibleAdmins = (communityMembers ?? [])
    .filter((m) => m.role === 'admin' && !memberIds.has(m.user_id))
    .map((m) => ({ userId: m.user_id, name: m.profiles?.full_name ?? null, avatarPath: m.profiles?.avatar_url ?? null }));

  // UX-GRP-14: a member who was away when the season closed hears about it once, here.
  const latestClosed = pastSeasons.reduce<number | null>((n, s) => Math.max(n ?? 0, s.season_number), null);
  const seenSeason = useLastSeenSeason(id);
  const endedNotice = isMember ? seasonToAnnounce(latestClosed, seenSeason) : null;
  // A first visit records the latest closed season silently (no old news for new members).
  useEffect(() => {
    if (isMember && latestClosed != null && seenSeason == null) markSeasonSeen(id, latestClosed);
  }, [id, isMember, latestClosed, seenSeason]);
  const closeNotice = () => {
    if (endedNotice != null) markSeasonSeen(id, endedNotice);
  };
  const { data: endedRanking } = useGroupRanking(
    endedNotice != null ? (pastSeasons.find((s) => s.season_number === endedNotice)?.id ?? '') : '',
  );

  const join = useJoinGroup();
  const unarchive = useUnarchiveGroup();
  const [ack, setAck] = useState(false);
  const [unarchiveOpen, setUnarchiveOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!group) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">{t('noAccessTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('noAccessBody')}</p>
        <Button variant="secondary" asChild>
          <Link href="/app/groups">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    toast(t(code, { defaultValue: t('unknown_error') }), 'error');
  };

  const upcoming = (events ?? []).filter(
    (e) => e.status === 'scheduled' && e.starts_at != null && new Date(e.starts_at).getTime() >= now,
  );
  const createEventHref = `/app/community/${group.community_id}/event-create?groupId=${id}`;
  const mayCreateEvent = !!canCreateEvent && !isArchived;
  const rankingRows = sortRanking(ranking ?? [], sort).slice(0, PREVIEW_ROWS);
  const lastUpdated = ranking?.[0]?.lastUpdated;
  const fmtDate = (
    iso: string,
    opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  ) => new Date(iso).toLocaleDateString(i18n.language, opts);

  // Joining a public group is also entering its community; one with rules asks for them first
  // (UX-COMM-05), as the community page's own Join does.
  const inCommunity = (memberships ?? []).some((m) => m.community?.id === group.community_id);
  const rulesText = community?.cancellation_rules_enabled ? (community.cancellation_rules_text ?? '') : '';
  const needsAck = !inCommunity && !!community?.cancellation_rules_enabled;

  const onJoin = async () => {
    try {
      await join.mutateAsync({ groupId: id, communityId: group.community_id, ack });
      toast(t('joinedToast', { name: group.name }));
    } catch (e) {
      fail(e);
    }
  };
  const onUnarchive = async () => {
    try {
      await unarchive.mutateAsync({ groupId: id, communityId: group.community_id });
      setUnarchiveOpen(false);
      toast(t('unarchivedToast'));
    } catch (e) {
      fail(e);
    }
  };

  const footer = isArchived ? (
    isAdmin ? (
      <Button className="w-full sm:w-auto" onClick={() => setUnarchiveOpen(true)} data-testid="group-unarchive">
        {t('unarchiveCta')}
      </Button>
    ) : null
  ) : !isMember && !group.is_private ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {needsAck ? (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            {tc('ackRules')}
            {rulesText ? <span className="mt-1 block whitespace-pre-line text-xs">{rulesText}</span> : null}
          </span>
        </label>
      ) : (
        <span />
      )}
      <Button
        className="w-full sm:w-auto"
        disabled={join.isPending || (needsAck && !ack)}
        onClick={() => void onJoin()}
        data-testid="group-join"
      >
        {t('joinCta')}
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex min-h-full flex-col">
      <GroupHeader
        name={group.name}
        description={group.description}
        thumbnailPath={group.thumbnail_path}
        fallbackHref="/app/groups"
        actions={
          <GroupMenu
            target={{
              id,
              name: group.name,
              communityId: group.community_id,
              archivedAt: group.archived_at,
              currentSeasonNumber: currentSeason?.season_number ?? null,
              isMember,
            }}
            isAdmin={isAdmin}
            eligibleAdmins={eligibleAdmins}
          />
        }
      />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-4 pb-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <AvatarStack
              people={members.map((m) => ({ id: m.user_id, name: m.full_name, avatarPath: m.avatar_url }))}
              countLabel={t('playersCount', { count: members.length })}
              href={`/app/group/${id}/members`}
            />
            {canInvite && !isArchived ? (
              <Link href={`/app/group/${id}/invite`} className="text-sm font-medium text-primary hover:underline">
                {t('inviteMembersCta')}
              </Link>
            ) : null}
          </div>
          {group.is_private || isArchived ? (
            <div className="flex gap-2">
              {group.is_private ? <Badge variant="secondary">{t('privateGroupLabel')}</Badge> : null}
              {isArchived ? <Badge variant="outline">{t('archivedTag')}</Badge> : null}
            </div>
          ) : null}
        </div>

        {/* Events: upcoming cards with "See all"; no permanent "Create event" row (UX-GRP-04). */}
        <section className="flex flex-col gap-3" aria-labelledby="group-events-title">
          <SectionTitle
            id="group-events-title"
            title={t('eventsTitle')}
            seeAllHref={upcoming.length > 0 ? `/app/group/${id}/events` : undefined}
            seeAllLabel={t('seeAll')}
          />
          {upcoming.length === 0 ? (
            <GroupEmpty
              title={t('groupEventsEmptyTitle')}
              body={t('groupEventsEmptyBody')}
              action={mayCreateEvent ? { label: t('groupEventsEmptyCta'), href: createEventHref } : undefined}
              testId="empty-group-events"
            />
          ) : (
            // w-0 + min-w-full: the rail scrolls inside the page instead of widening it to fit every card.
            <div className="flex w-0 min-w-full gap-3 overflow-x-auto pb-1">
              {upcoming.map((e) => (
                <div key={e.id} className="w-72 shrink-0">
                  <EventCard event={e as unknown as EventCardEvent} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ranking: top 10, W/L, sortable; the period filter lives on the full page. */}
        <section className="flex flex-col gap-3" aria-labelledby="group-ranking-title">
          <SectionTitle
            id="group-ranking-title"
            title={t('rankingTitle')}
            seeAllHref={rankingRows.length > 0 ? `/app/group/${id}/ranking` : undefined}
            seeAllLabel={t('seeAll')}
          />
          {rankingRows.length === 0 ? (
            <GroupEmpty
              title={t('rankingEmptyTitle')}
              body={t('rankingPlaceholder')}
              action={mayCreateEvent ? { label: t('groupEventsEmptyCta'), href: createEventHref } : undefined}
              testId="empty-group-ranking"
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {lastUpdated ? t('lastUpdate', { date: fmtDate(lastUpdated) }) : null}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="tertiary" size="sm" className="text-primary">
                      {t('sortedBy', { by: sort === 'wins' ? t('sortWins') : t('sortPoints') })}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('sortBy')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as RankingSort)}>
                      <DropdownMenuRadioItem value="points">{t('sortPoints')}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="wins">{t('sortWins')}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <RankingTable rows={rankingRows} variant="preview" />
            </>
          )}
        </section>

        {/* Past seasons, hidden until there is one (UX-GRP-14). */}
        {pastSeasons.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="group-seasons-title">
            <SectionTitle id="group-seasons-title" title={t('previousSeasonsTitle')} />
            <div className="grid gap-2 sm:grid-cols-2">
              {pastSeasons.map((s) => (
                <Link
                  key={s.id}
                  href={`/app/group/${id}/season/${s.season_number}`}
                  className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-muted/50"
                  data-testid={`group-season-${s.season_number}`}
                >
                  <span className="text-sm font-medium">{t('seasonTag', { number: s.season_number })}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('seasonPeriod', {
                      from: fmtDate(s.started_at, { month: 'short', year: 'numeric' }),
                      to: fmtDate(s.ended_at!, { month: 'short', year: 'numeric' }),
                    })}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="group-info-title">
          <SectionTitle id="group-info-title" title={t('generalInfoTitle')} />
          {community ? (
            <Link
              href={`/app/community/${community.id}`}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
            >
              <GroupThumb path={community.thumbnail_path} name={community.name} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{community.name}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t('createdOn', { date: fmtDate(group.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
        </section>
      </div>

      {footer ? <div className="sticky bottom-0 z-10 border-t bg-background p-4">{footer}</div> : null}

      <GroupConfirm
        open={unarchiveOpen}
        onClose={() => setUnarchiveOpen(false)}
        title={t('unarchiveConfirmTitle')}
        body={t('unarchiveConfirmBody')}
        confirmLabel={t('unarchiveCta')}
        cancelLabel={t('cancel')}
        busy={unarchive.isPending}
        onConfirm={onUnarchive}
      />

      <Dialog open={endedNotice != null} onOpenChange={(o) => (o ? null : closeNotice())}>
        <DialogContent data-testid="season-ended-notice">
          <DialogHeader>
            <DialogTitle>{t('seasonEndedTitle', { number: endedNotice ?? 0 })}</DialogTitle>
            <DialogDescription>{t('seasonEndedBody')}</DialogDescription>
          </DialogHeader>
          {(endedRanking ?? []).length > 0 ? (
            <RankingTable rows={(endedRanking ?? []).slice(0, 3)} variant="full" />
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                const n = endedNotice;
                closeNotice();
                if (n != null) router.push(`/app/group/${id}/season/${n}`);
              }}
            >
              {t('seeFinalStandings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A section title with "See all" on the same line (UX-GRP-04). */
function SectionTitle({
  id,
  title,
  seeAllHref,
  seeAllLabel,
}: {
  id: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {seeAllHref ? (
        <Link href={seeAllHref} className="text-sm font-medium text-primary hover:underline">
          {seeAllLabel}
        </Link>
      ) : null}
    </div>
  );
}
