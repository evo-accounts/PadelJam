'use client';
/**
 * One closed season (UX-GRP-14): its final ranking and the events it held. Reached from a card in
 * the group page's Past seasons, from the season-ended notice, and — with `?ended=1` — straight
 * after an admin resets the ranking, when it opens as the completion view: a closing message above
 * the same final leaderboard, and "Share".
 *
 * A player who left before the season closed is still in its standings, in greyscale: the
 * standings record who played, not who is in the group now (UX-GRP-15).
 */
import { useParams, useSearchParams } from 'next/navigation';
import { useGroup, useGroupEvents, useGroupRanking, useGroupSeasons } from '@padel/api';
import { useT } from '@padel/i18n';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { RankingTable } from '@/components/group/RankingTable';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { groupUrl, shareText } from '@/lib/groupShare';

export default function GroupSeasonPage() {
  const { t, i18n } = useT('group');
  const { id, number } = useParams<{ id: string; number: string }>();
  const isCompletion = useSearchParams().get('ended') === '1';
  const n = Number(number);
  const { data: group } = useGroup(id);
  const { data: seasons } = useGroupSeasons(id);
  const { data: events } = useGroupEvents(id);
  const season = (seasons ?? []).find((s) => s.season_number === n);
  const { data: ranking } = useGroupRanking(season?.id ?? '');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const from = season ? new Date(season.started_at).getTime() : 0;
  const to = season?.ended_at ? new Date(season.ended_at).getTime() : Number.POSITIVE_INFINITY;
  const seasonEvents = (events ?? [])
    .filter((e) => {
      if (!e.starts_at || e.status === 'cancelled') return false;
      const at = new Date(e.starts_at).getTime();
      return at >= from && at <= to;
    })
    .reverse();

  const onShare = async () => {
    const lines = (ranking ?? []).slice(0, 10).map((r) => `${r.rank}. ${r.name ?? '—'} — ${r.points}`);
    const title = `${group?.name ?? ''} · ${t('seasonFinalTitle', { number: n })}`;
    try {
      const how = await shareText(title, [title, ...lines].join('\n'), groupUrl(id));
      if (how === 'copied') toast(t('rankingCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <GroupPageTitle
        title={t('seasonTag', { number: n })}
        fallbackHref={`/app/group/${id}`}
        subtitle={season?.ended_at ? t('seasonPeriod', { from: fmt(season.started_at), to: fmt(season.ended_at) }) : group?.name}
        actions={
          (ranking ?? []).length > 0 ? (
            <Button variant={isCompletion ? 'default' : 'outline'} onClick={() => void onShare()} data-testid="season-share">
              {t('shareCta')}
            </Button>
          ) : null
        }
      />
      {isCompletion ? (
        <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-4" data-testid="season-completion">
          <h2 className="text-lg font-semibold">{t('seasonClosedTitle', { number: n })}</h2>
          <p className="text-sm text-muted-foreground">{t('seasonClosedBody', { next: n + 1 })}</p>
        </div>
      ) : null}

      <h2 className="text-lg font-semibold">{t('finalRankingTitle')}</h2>
      {(ranking ?? []).length === 0 ? (
        <GroupEmpty title={t('seasonNoRanking')} testId="empty-season-ranking" />
      ) : (
        <RankingTable rows={ranking ?? []} variant="full" />
      )}

      <h2 className="mt-2 text-lg font-semibold">{t('eventsTitle')}</h2>
      {seasonEvents.length === 0 ? (
        <GroupEmpty title={t('seasonNoEvents')} testId="empty-season-events" />
      ) : (
        <div className="flex flex-col gap-2">
          {seasonEvents.map((e) => (
            <EventCard key={e.id} event={e as unknown as EventCardEvent} />
          ))}
        </div>
      )}
    </div>
  );
}
