'use client';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface MatchCardMatch {
  id: string;
  court_number: number;
  side_a_score: number | null;
  side_b_score: number | null;
  status: string;
  match_players: {
    side: string;
    event_participants: {
      guest_name: string | null;
      profiles: { full_name: string | null } | null;
    } | null;
  }[];
}

interface MatchCardProps {
  match: MatchCardMatch;
  canScore: boolean;
  onScore: (match: MatchCardMatch) => void;
}

function sideNames(match: MatchCardMatch, side: 'a' | 'b'): string {
  const names = match.match_players
    .filter((mp) => mp.side === side)
    .map(
      (mp) =>
        mp.event_participants?.profiles?.full_name ?? mp.event_participants?.guest_name ?? '—',
    );
  return names.length > 0 ? names.join(' / ') : '—';
}

export function MatchCard({ match, canScore, onScore }: MatchCardProps) {
  const { t } = useT('event');
  const scored = match.status !== 'pending';

  const body = (
    <CardContent className="flex flex-col gap-2 py-4">
      <p className="text-xs text-muted-foreground">{t('courtLabel', { n: match.court_number })}</p>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{sideNames(match, 'a')}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{t('vsLabel')}</span>
        <span className="min-w-0 flex-1 truncate text-right text-sm font-medium">
          {sideNames(match, 'b')}
        </span>
      </div>
      <div className="text-center text-sm">
        {match.status === 'not_played' ? (
          <Badge variant="secondary">{t('notPlayedBadge')}</Badge>
        ) : scored ? (
          <span className="font-semibold">
            {match.side_a_score ?? 0} – {match.side_b_score ?? 0}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {canScore ? t('tapToScore') : t('matchPending')}
          </span>
        )}
      </div>
    </CardContent>
  );

  if (!canScore) {
    return <Card>{body}</Card>;
  }

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/50">
      <button type="button" className="w-full text-left" onClick={() => onScore(match)}>
        {body}
      </button>
    </Card>
  );
}
