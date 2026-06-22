'use client';
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import {
  useEventRounds,
  useEventMatches,
  useEventParticipants,
  useSubmitScore,
  useGenerateNextRound,
} from '@padel/api';
import { allScored } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchCard, type MatchCardMatch } from './MatchCard';
import { ScoreDialog } from './ScoreDialog';
import { RoundSelector } from './RoundSelector';

interface MatchesTabProps {
  eventId: string;
  canScore: boolean;
  isOrganizer: boolean;
}

export function MatchesTab({ eventId, canScore, isOrganizer }: MatchesTabProps) {
  const { t } = useT('event');
  const rounds = useEventRounds(eventId);
  const matches = useEventMatches(eventId);
  const participants = useEventParticipants(eventId);
  const submitScore = useSubmitScore(eventId);
  const generateNextRound = useGenerateNextRound(eventId);

  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [scoringMatch, setScoringMatch] = useState<MatchCardMatch | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roundRows = (rounds.data ?? [])
    .slice()
    .sort((a, b) => a.round_number - b.round_number);
  const latestRound = roundRows[roundRows.length - 1] ?? null;

  useEffect(() => {
    if (selectedRoundId == null && latestRound) setSelectedRoundId(latestRound.id);
  }, [latestRound, selectedRoundId]);

  if (rounds.isLoading || matches.isLoading) {
    return <Skeleton className="h-60" />;
  }

  if (roundRows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noMatches')}</p>;
  }

  const selectedId = selectedRoundId ?? latestRound?.id ?? null;
  const allMatches = matches.data ?? [];
  const roundMatches = allMatches
    .filter((m) => m.round_id === selectedId)
    .slice()
    .sort((a, b) => a.court_number - b.court_number);

  // `event_rounds` has no rests column; rests are derived as confirmed
  // participants not present in any match of the selected round.
  const playingIds = new Set<string>();
  for (const m of roundMatches) {
    for (const mp of m.match_players) playingIds.add(mp.participant_id);
  }
  const restNames = (participants.data ?? [])
    .filter((p) => p.status === 'confirmed' && !playingIds.has(p.id))
    .map((p) => p.profiles?.full_name ?? p.guest_name ?? '—');

  const latestScored =
    latestRound != null && allScored(allMatches.filter((m) => m.round_id === latestRound.id));
  const showGenerate = isOrganizer && latestScored;

  const onScore = (match: MatchCardMatch) => {
    setScoringMatch(match);
    setError(null);
    setOpen(true);
  };

  const onSubmit = (vals: { sideA: number; sideB: number; notPlayed: boolean }) => {
    if (!scoringMatch) return;
    setError(null);
    submitScore
      .mutateAsync({
        matchId: scoringMatch.id,
        sideA: vals.sideA,
        sideB: vals.sideB,
        notPlayed: vals.notPlayed,
      })
      .then(() => {
        setOpen(false);
        setScoringMatch(null);
      })
      .catch((x) => setError(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const onGenerate = () => {
    setError(null);
    generateNextRound
      .mutateAsync()
      .catch((x) => setError(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  return (
    <div className="flex flex-col gap-4">
      {roundRows.length > 1 ? (
        <RoundSelector rounds={roundRows} selectedId={selectedId} onSelect={setSelectedRoundId} />
      ) : null}

      {roundMatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noMatches')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roundMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m as MatchCardMatch}
              canScore={canScore}
              onScore={onScore}
            />
          ))}
        </div>
      )}

      {restNames.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t('restingTitle')}</p>
          <p className="text-sm text-muted-foreground">{restNames.join(', ')}</p>
        </div>
      ) : null}

      {showGenerate ? (
        <Button
          className="self-start"
          disabled={generateNextRound.isPending}
          onClick={onGenerate}
        >
          {t('generateRoundCta')}
        </Button>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ScoreDialog
        match={scoringMatch}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setScoringMatch(null);
        }}
        onSubmit={onSubmit}
        submitting={submitScore.isPending}
      />
    </div>
  );
}
