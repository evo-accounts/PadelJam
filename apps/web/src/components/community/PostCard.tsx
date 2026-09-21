'use client';
import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useEvent, useEventResultSummary, useToggleLike } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';
import { PostImage } from './PostImage';

export interface Post {
  id: string;
  community_id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  kind?: string;
  result_event_id?: string | null;
  author: { full_name: string | null; avatar_url: string | null } | null;
  likes: { count: number }[];
  comments: { count: number }[];
  mine: { user_id: string }[];
}

/**
 * The body of a `kind = 'result'` post: the event's final ranking, as posted by
 * `post_event_result`. Such a post has NO body of its own — the row carries only
 * `result_event_id` — so without this branch the card renders as a header and a
 * footer around nothing.
 *
 * Two queries, two different gates, and they do not agree:
 *
 *   - `event_result_summary` is SECURITY DEFINER and checks COMMUNITY membership,
 *     so every member who can read the post can read the ranking.
 *   - the `events` row is behind "events: read", which wants GROUP membership
 *     (or organizer/participant/invitee).
 *
 * A community member who never joined the group therefore gets the ranking but
 * not the event. That is why the name, the date and the link are all conditional
 * on `event.data` rather than assumed: the ranking is the content, the event is
 * an enrichment. Mobile offers the link unconditionally and dead-ends those users.
 */
function ResultBody({ eventId }: { eventId: string }) {
  const { t, i18n } = useT('community');
  const { t: te } = useT('event');
  const summary = useEventResultSummary(eventId);
  const event = useEvent(eventId);

  const rows = summary.data ?? [];
  /**
   * The post's own `created_at` is when the result was POSTED, which can be long
   * after the event was played — the demo seed posts a week-old Mexicano today.
   * The card header dates the post; this dates the match, so the two are never
   * confused for each other.
   */
  const playedAt = event.data?.starts_at
    ? new Date(event.data.starts_at).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {t('resultCardTitle')}
        </span>
        {event.data ? <span className="font-medium">{event.data.name}</span> : null}
        {playedAt ? <span className="text-xs text-muted-foreground">{playedAt}</span> : null}
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('resultUnavailable')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="w-10 py-2 font-medium">
                {te('rankCol')}
              </th>
              <th scope="col" className="py-2 font-medium">
                {te('playerCol')}
              </th>
              <th scope="col" className="w-16 py-2 text-right font-medium">
                {te('pointsCol')}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Keyed by index, not by rank: standings() ranks with SQL `rank()`,
                which TIES — two players level on points are both rank 1, and
                the key would collide. The list is static per event, so the
                index is stable (RankingTable does the same). */}
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="py-2 tabular-nums">{row.rank}</td>
                <td className="truncate py-2">{row.name}</td>
                <td className="py-2 text-right tabular-nums">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {event.data ? (
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href={`/app/event/${eventId}`}>{t('viewEventCta')}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function PostCard({ post, communityId }: { post: Post; communityId: string }) {
  const { t } = useT('community');
  const like = useToggleLike(communityId);

  const likedByMe = (post.mine?.length ?? 0) > 0;
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const name = post.author?.full_name ?? '—';
  const initials = (post.author?.full_name ?? '?').slice(0, 2).toUpperCase();
  const date = new Date(post.created_at).toLocaleDateString();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={avatarUrl(post.author?.avatar_url) ?? undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {post.kind === 'result' && post.result_event_id ? (
          <ResultBody eventId={post.result_event_id} />
        ) : (
          <>
            {post.body ? <p className="whitespace-pre-wrap">{post.body}</p> : null}
            {post.image_path ? <PostImage path={post.image_path} /> : null}
          </>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => like.mutate({ postId: post.id, liked: likedByMe })}
        >
          <Heart className={likedByMe ? 'fill-red-500 text-red-500' : ''} />
          {likeCount}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/app/community/${communityId}/post/${post.id}`}>
            <MessageCircle />
            {commentCount} {t('comments')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
