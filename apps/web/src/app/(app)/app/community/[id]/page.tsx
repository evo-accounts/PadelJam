'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useCommunity,
  useCommunityMembers,
  useCommunities,
  useJoinCommunity,
  useLeaveCommunity,
  useCommunityPosts,
  useCommunityPermissions,
  useCommunityFeedRealtime,
  useCommunityReviews,
  useCommunityGroups,
  useMayCreateGroup,
  useCommunityEvents,
} from '@padel/api';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { CommunityHeader } from '@/components/community/CommunityHeader';
import { GroupCard } from '@/components/group/GroupCard';
import { MembersList } from '@/components/community/MembersList';
import { PostComposer } from '@/components/community/PostComposer';
import { PostCard } from '@/components/community/PostCard';
import { StarRating } from '@/components/community/StarRating';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const privacyKey: Record<string, 'privacyPublic' | 'privacyRequest' | 'privacyPrivate'> = {
  public: 'privacyPublic',
  request_to_join: 'privacyRequest',
  private: 'privacyPrivate',
};

const typeKey: Record<string, 'typeClub' | 'typeTeam' | 'typeFriends'> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

export default function CommunityDetailPage() {
  const { t, i18n } = useT('community');
  const { t: tg } = useT('group');
  const { t: te } = useT('event');
  const { id } = useParams<{ id: string }>();
  const c = useCommunity(id);
  const members = useCommunityMembers(id);
  const mine = useCommunities();
  const join = useJoinCommunity(id);
  const leave = useLeaveCommunity();

  useCommunityFeedRealtime(id);
  const posts = useCommunityPosts(id);
  const perms = useCommunityPermissions(id);
  const reviews = useCommunityReviews(id);
  const groups = useCommunityGroups(id);
  // Permission only (decision 6): a community at its plan's group limit still offers "Create
  // group", and the form explains the limit instead of the button silently not being there.
  const canCreateGroup = useMayCreateGroup(id);
  const events = useCommunityEvents(id);

  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (c.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!c.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t('notAvailable')}</p>
      </div>
    );
  }

  const community = c.data;
  const memberRows = members.data ?? [];

  const mineRow = (mine.data ?? []).find((r) => r.community?.id === id);
  const isMember = !!mineRow;

  const myRole = mineRow?.role;
  const isAdmin = myRole === 'admin';
  const canPost =
    isMember &&
    (myRole === 'admin' || perms.data?.create_posts === true);

  const needsAck = community.cancellation_rules_enabled && !isMember;

  let cta: React.ReactNode = null;
  if (isMember) {
    cta = (
      <Button
        variant="outline"
        onClick={() => leave.mutate(id, { onError: () => setErr(t('leaveError')) })}
      >
        {t('leave')}
      </Button>
    );
  } else if (community.privacy === 'public') {
    cta = (
      <Button disabled={needsAck && !ack} onClick={() => join.mutate(ack)}>
        {t('join')}
      </Button>
    );
  } else if (community.privacy === 'request_to_join') {
    cta = join.isSuccess ? (
      <span className="text-sm text-muted-foreground">{t('requested')}</span>
    ) : (
      <Button disabled={needsAck && !ack} onClick={() => join.mutate(ack)}>
        {t('requestToJoin')}
      </Button>
    );
  } else {
    cta = (
      <Button disabled variant="outline">
        {t('inviteOnly')}
      </Button>
    );
  }

  const ctaBlock = (
    <div className="flex flex-col items-end gap-2">
      {needsAck ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          {t('ackRules')}
        </label>
      ) : null}
      {cta}
      {isAdmin ? (
        <Button asChild variant="outline">
          <Link href={`/app/community/${id}/manage`}>{t('manageTitle')}</Link>
        </Button>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );

  const admins = memberRows.filter((m) => m.role === 'admin');
  const createdLabel = (() => {
    if (!community.created_at) return null;
    const d = new Date(community.created_at);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(i18n.language);
  })();

  return (
    <div className="flex flex-col gap-6 pb-6">
      <CommunityHeader community={community} memberCount={memberRows.length} cta={ctaBlock} />

      <div className="px-4">
        <Tabs defaultValue="about">
          <TabsList>
            <TabsTrigger value="about">{t('about')}</TabsTrigger>
            <TabsTrigger value="members">{t('members')}</TabsTrigger>
            <TabsTrigger value="posts">{t('posts')}</TabsTrigger>
            <TabsTrigger value="events">{t('events')}</TabsTrigger>
            <TabsTrigger value="groups">{t('groups')}</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="flex flex-col gap-3 pt-4 text-sm">
            <Link href={`/app/community/${id}/reviews`} className="flex items-center gap-2">
              <StarRating value={Math.round(reviews.data?.average ?? 0)} />
              <span className="text-sm text-muted-foreground">
                {t('reviewsCount', { count: reviews.data?.count ?? 0 })}
              </span>
            </Link>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {t(typeKey[community.type] ?? 'typeClub')}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {t(privacyKey[community.privacy] ?? 'privacyPublic')}
              </span>
            </div>
            <dl className="flex flex-col gap-2">
              {community.location ? (
                <Row label={t('location')} value={community.location} />
              ) : null}
              {createdLabel ? <Row label={t('created')} value={createdLabel} /> : null}
              {admins.length > 0 ? (
                <Row
                  label={t('admins')}
                  value={admins.map((m) => m.profiles?.full_name ?? '—').join(', ')}
                />
              ) : null}
            </dl>
            {community.cancellation_rules_enabled ? (
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{t('cancellationRules')}</h3>
                {community.cancellation_rules_text ? (
                  <p className="whitespace-pre-line text-muted-foreground">
                    {community.cancellation_rules_text}
                  </p>
                ) : null}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="members" className="pt-4">
            <MembersList members={memberRows} />
          </TabsContent>

          <TabsContent value="posts" className="pt-4">
            <div className="flex flex-col gap-4">
              <PostComposer communityId={id} canPost={canPost} />
              {posts.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (posts.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('emptyFeed')}</p>
              ) : (
                (posts.data ?? []).map((p) => (
                  <PostCard key={p.id} post={p} communityId={id} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="flex flex-col gap-3 pt-4">
            {isAdmin ? (
              <Button asChild variant="outline" className="self-start">
                <Link href={`/app/community/${id}/event-create`}>{te('newEventCta')}</Link>
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

          <TabsContent value="groups" className="flex flex-col gap-3 pt-4">
            {canCreateGroup.data === true ? (
              <Button asChild variant="outline" className="self-start">
                <Link href={`/app/community/${id}/group-create`}>{tg('createCta')}</Link>
              </Button>
            ) : null}
            {groups.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (groups.data ?? []).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">{t('comingSoon')}</p>
            ) : (
              (groups.data ?? []).map((g) => (
                <GroupCard
                  key={g.id}
                  group={{
                    id: g.id,
                    name: g.name,
                    thumbnailPath: g.thumbnail_path,
                    archived: g.archived_at != null,
                  }}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
