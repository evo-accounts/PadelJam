import {
  useEvent,
  useEventMatches,
  useEventParticipants,
  useEventRealtime,
  useEventRounds,
  useEventStandings,
  useEventTeams,
  useFinishEvent,
  useGenerateNextRound,
  useGroup,
  useSetEventRanking,
  useSubmitScore,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareResultsModal } from '@/components/event/ShareResultsModal';
import { TimerTab } from '@/components/event/TimerTab';
import { colors, palette } from '../../../theme';
import { BottomSheet, Button, Card, Chip, TopBar } from '../../../components/ui';

type MatchRow = NonNullable<ReturnType<typeof useEventMatches>['data']>[number];
type MatchPlayer = MatchRow['match_players'][number];

/** Display name for an embedded match-player participant. */
function playerName(mp: MatchPlayer): string {
  const ep = mp.event_participants;
  return ep?.profiles?.full_name ?? ep?.guest_name ?? '—';
}

/** Join a side's player names with a separator (numbers/glue only). */
function sideNames(players: MatchPlayer[], side: 'a' | 'b'): string {
  const names = players.filter((mp) => mp.side === side).map(playerName);
  return names.length > 0 ? names.join(' & ') : '—';
}

export default function EventLiveScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  // Hooks must all run before any early return.
  useEventRealtime(id);
  const { data: event, isLoading } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const { data: roundsData } = useEventRounds(id);
  const { data: matchesData } = useEventMatches(id);
  const { data: standingsData } = useEventStandings(id);
  const { data: teamsData } = useEventTeams(id);
  const { data: group } = useGroup(event?.group_id);

  // Mutations (declared before any early return).
  const submitScore = useSubmitScore(id);
  const generateNextRound = useGenerateNextRound(id);
  const finishEvent = useFinishEvent(id);
  const setEventRanking = useSetEventRanking(id);

  const rounds = roundsData ?? [];
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  // null = not explicitly chosen yet; the default depends on event.status.
  const [tab, setTab] = useState<'overview' | 'matches' | 'leaderboard' | 'timer' | null>(null);

  // Interactive state.
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Score modal fields.
  const [sideAInput, setSideAInput] = useState('');
  const [sideBInput, setSideBInput] = useState('');
  const [notPlayed, setNotPlayed] = useState(false);

  // Finish modal fields.
  const [finishMessage, setFinishMessage] = useState('');

  const activeRoundId = selectedRoundId ?? lastRound?.id ?? null;

  /** Run an async action with shared busy/error handling. */
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setBusy(false);
    }
  };

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // --- No access (RLS hid the row) ---
  if (event == null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.centerBox}>
          <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
          <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
          <Button
            label={t('back')}
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Not started yet: organizer starts from the detail screen ---
  if (event.status === 'scheduled') {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.centerBox}>
          <Text style={styles.noAccessBody}>{t('waitingToStart')}</Text>
          <Button
            label={t('back')}
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const participants = participantsData ?? [];
  const matches = matchesData ?? [];
  const standings = standingsData ?? [];
  const teams = teamsData ?? [];

  // Name map: participant id -> display name.
  const nameById = new Map<string, string>();
  for (const p of participants) {
    nameById.set(p.id, p.profiles?.full_name ?? p.guest_name ?? '—');
  }
  // Team-number map for leaderboard team rows.
  const teamNumberById = new Map<string, number>();
  for (const team of teams) {
    teamNumberById.set(team.id, team.team_number);
  }

  // Plain-text results summary for the share sheet.
  const resultsSummary = [
    `🏆 ${event.name}`,
    ...standings.map((s) => `${s.rank}. ${nameById.get(s.entity_id) ?? '—'} (${s.points})`),
  ].join('\n');

  // --- Matches for the selected round, sorted by court ---
  const roundMatches = matches
    .filter((m) => m.round_id === activeRoundId)
    .sort((a, b) => a.court_number - b.court_number);

  // My match in this round: a player whose participant.user_id === uid.
  const myMatchId =
    uid == null
      ? null
      : (roundMatches.find((m) =>
          m.match_players.some((mp) => mp.event_participants?.user_id === uid),
        )?.id ?? null);

  // Order: my match first, then the rest by court.
  const orderedMatches: MatchRow[] =
    myMatchId == null
      ? roundMatches
      : [
          ...roundMatches.filter((m) => m.id === myMatchId),
          ...roundMatches.filter((m) => m.id !== myMatchId),
        ];

  // Resting: confirmed participants not present in any match of this round.
  const playingIds = new Set<string>();
  for (const m of roundMatches) {
    for (const mp of m.match_players) {
      playingIds.add(mp.participant_id);
    }
  }
  const resting = participants.filter(
    (p) => p.status === 'confirmed' && !playingIds.has(p.id),
  );

  const scoreText = (m: MatchRow): string => {
    if (m.status === 'not_played') return t('notPlayedBadge');
    if (m.side_a_score != null && m.side_b_score != null) {
      return `${m.side_a_score} - ${m.side_b_score}`;
    }
    return t('matchPending');
  };

  // --- Interactive permissions / derived flags ---
  const isOrganizer = uid != null && uid === event.organizer_id;
  const isInProgress = event.status === 'in_progress';
  const isCompleted = event.status === 'completed';
  const isPublicGroup = event.group_id != null && !event.is_private;

  const isMyMatch = (m: MatchRow): boolean =>
    uid != null && m.match_players.some((mp) => mp.event_participants?.user_id === uid);

  const canSubmit = (m: MatchRow): boolean => {
    if (!isInProgress) return false;
    if (isOrganizer) return true;
    return event.players_submit_results && isMyMatch(m) && m.status === 'pending';
  };

  // Last round fully scored: every match of the highest round_number is non-pending.
  const lastRoundId = lastRound?.id ?? null;
  const lastRoundMatches = matches.filter((m) => m.round_id === lastRoundId);
  const lastRoundFullyScored =
    lastRoundMatches.length > 0 && lastRoundMatches.every((m) => m.status !== 'pending');

  const canAddRound =
    isInProgress &&
    isOrganizer &&
    event.event_type !== 'americano' &&
    lastRoundFullyScored;

  // All matches across all rounds scored.
  const allScored = matches.length > 0 && matches.every((m) => m.status !== 'pending');

  // Effective bottom tab: completed events default to Overview, others to Matches.
  // Overview only exists when completed; fall back to Matches otherwise.
  const defaultTab = isCompleted ? 'overview' : 'matches';
  const chosenTab = tab ?? defaultTab;
  const effectiveTab = chosenTab === 'overview' && !isCompleted ? 'matches' : chosenTab;

  const scoringMatch =
    scoringMatchId == null ? null : (matches.find((m) => m.id === scoringMatchId) ?? null);

  const openScoreModal = (m: MatchRow): void => {
    setScoringMatchId(m.id);
    setError(null);
    setNotPlayed(m.status === 'not_played');
    setSideAInput(m.side_a_score != null ? String(m.side_a_score) : '');
    setSideBInput(m.side_b_score != null ? String(m.side_b_score) : '');
  };

  const closeScoreModal = (): void => {
    setScoringMatchId(null);
    setError(null);
  };

  const pointsTotal = event.scoring_value ?? 0;
  const isPoints = event.scoring_mode === 'points';
  const isTimed = event.scoring_mode === 'time';
  const clamp = (n: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, n));

  const parsedSideA = (() => {
    const n = Number.parseInt(sideAInput, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  const effectiveSideA = isPoints ? clamp(parsedSideA, 0, pointsTotal) : parsedSideA;
  const computedSideB = isPoints
    ? pointsTotal - effectiveSideA
    : (() => {
        const n = Number.parseInt(sideBInput, 10);
        return Number.isFinite(n) ? n : 0;
      })();

  const onSaveScore = (m: MatchRow): void => {
    void run(async () => {
      await submitScore.mutateAsync(
        notPlayed
          ? { matchId: m.id, sideA: 0, sideB: 0, notPlayed: true }
          : { matchId: m.id, sideA: Math.max(0, effectiveSideA), sideB: Math.max(0, computedSideB) },
      );
      closeScoreModal();
    });
  };

  const onAddRound = (): void => {
    void run(async () => {
      const newId = await generateNextRound.mutateAsync();
      if (typeof newId === 'string') setSelectedRoundId(newId);
    });
  };

  const onFinish = (countsOverride?: boolean): void => {
    void run(async () => {
      const msg = finishMessage.trim();
      await finishEvent.mutateAsync({
        countsOverride,
        finishMessage: msg.length > 0 ? msg : undefined,
      });
      setFinishOpen(false);
      setShareOpen(true);
    });
  };

  const onToggleRanking = (value: boolean): void => {
    void run(async () => {
      await setEventRanking.mutateAsync(value);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        title={event.status === 'completed' ? t('completedTitle') : t('liveTitle')}
        onBack={() => router.back()}
        backLabel={t('back')}
      />

      {/* Round tabs */}
      {rounds.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roundTabs}
        >
          {rounds.map((r) => {
            const active = r.id === activeRoundId;
            return (
              <Chip
                key={r.id}
                label={t('roundLabel', { number: r.round_number })}
                selected={active}
                onPress={() => setSelectedRoundId(r.id)}
              />
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {effectiveTab === 'overview' ? (
          <View style={styles.overview}>
            {event.finish_message != null && event.finish_message.length > 0 ? (
              <View style={styles.overviewSection}>
                <Text style={styles.sectionTitle}>{t('finishMessageTitle')}</Text>
                <Text style={styles.finishMessageText}>{event.finish_message}</Text>
              </View>
            ) : (
              <Text style={styles.completedHeading}>{t('completedTitle')}</Text>
            )}

            {isOrganizer && isPublicGroup ? (
              <View style={styles.overviewSection}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{t('rankingToggleLabel')}</Text>
                  <Switch
                    value={event.counts_for_ranking}
                    onValueChange={onToggleRanking}
                    disabled={busy}
                  />
                </View>
                {error != null ? <Text style={styles.error}>{t(error)}</Text> : null}
              </View>
            ) : null}

            <Button
              label={t('shareResultsCta')}
              variant="secondary"
              onPress={() => setShareOpen(true)}
            />

          </View>
        ) : effectiveTab === 'matches' ? (
          orderedMatches.length === 0 ? (
            <Text style={styles.empty}>{t('noMatches')}</Text>
          ) : (
            <>
              {orderedMatches.map((m) => {
                const isMine = m.id === myMatchId;
                const tappable = canSubmit(m);
                const showHint = tappable && m.status !== 'played';
                return (
                  // Card takes an OPTIONAL onPress and renders a Pressable or a
                  // View accordingly — which is exactly what the local
                  // `tappable ? Pressable : View` was hand-rolling here, minus
                  // the conditional accessibilityRole spread.
                  <Card
                    key={m.id}
                    padding="none"
                    style={StyleSheet.flatten([styles.matchCard, isMine && styles.matchCardMine])}
                    {...(tappable ? { onPress: () => openScoreModal(m) } : {})}
                  >
                    <View style={styles.matchHeader}>
                      <Text style={styles.courtLabel}>
                        {t('courtLabel', { number: m.court_number })}
                      </Text>
                      {isMine ? (
                        <View style={styles.mineChip}>
                          <Text style={styles.mineChipText}>{t('yourMatchLabel')}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.matchBody}>
                      <Text style={styles.sideNames} numberOfLines={2}>
                        {sideNames(m.match_players, 'a')}
                      </Text>
                      <Text style={styles.score}>{scoreText(m)}</Text>
                      <Text style={styles.vs}>{t('vsLabel')}</Text>
                      <Text style={styles.sideNames} numberOfLines={2}>
                        {sideNames(m.match_players, 'b')}
                      </Text>
                    </View>
                    {showHint ? (
                      <Text style={styles.tapHint}>{t('tapToScore')}</Text>
                    ) : null}
                  </Card>
                );
              })}

              {canAddRound ? (
                <Button
                  label={t('addRoundCta')}
                  disabled={busy}
                  onPress={onAddRound}
                />
              ) : null}

              {resting.length > 0 ? (
                <View style={styles.restingSection}>
                  <Text style={styles.sectionTitle}>{t('restingTitle')}</Text>
                  {resting.map((p) => (
                    <Text key={p.id} style={styles.restingName}>
                      {nameById.get(p.id) ?? '—'}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          )
        ) : effectiveTab === 'timer' ? (
          <TimerTab eventId={id} isOrganizer={isOrganizer} />
        ) : standings.length === 0 ? (
          <Text style={styles.empty}>{t('standingsEmpty')}</Text>
        ) : (
          <View style={styles.board}>
            <View style={[styles.boardRow, styles.boardHeaderRow]}>
              <Text style={[styles.colRank, styles.boardHeader]}>{t('rankCol')}</Text>
              <Text style={[styles.colPlayer, styles.boardHeader]}>{t('playerCol')}</Text>
              <Text style={[styles.colPoints, styles.boardHeader]}>{t('pointsCol')}</Text>
              <Text style={[styles.colRecord, styles.boardHeader]}>{t('recordCol')}</Text>
            </View>
            {standings.map((s) => {
              const name = s.is_team
                ? t('teamLabel', { n: teamNumberById.get(s.entity_id) ?? 0 })
                : (nameById.get(s.entity_id) ?? '—');
              return (
                <View key={s.entity_id} style={styles.boardRow}>
                  <Text style={styles.colRank}>{s.rank}</Text>
                  <Text style={styles.colPlayer} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.colPoints}>{s.points}</Text>
                  <Text style={styles.colRecord}>{`${s.wins}-${s.draws}-${s.losses}`}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating finish button (organizer, in-progress) */}
      {isOrganizer && isInProgress ? (
        <Button
          label={t('finishCta')}
          fullWidth
          disabled={busy}
          onPress={() => {
            setError(null);
            setFinishMessage(event.finish_message ?? '');
            setFinishOpen(true);
          }}
        />
      ) : null}

      {/* Bottom segmented tabs */}
      <View style={styles.segmentBar}>
        {isCompleted ? (
          <Chip
            label={t('overviewTab')}
            selected={effectiveTab === 'overview'}
            onPress={() => setTab('overview')}
          />
        ) : null}
        <Chip
          label={t('matchesTab')}
          selected={effectiveTab === 'matches'}
          onPress={() => setTab('matches')}
        />
        {isTimed ? (
          <Chip
            label={t('timerTab')}
            selected={effectiveTab === 'timer'}
            onPress={() => setTab('timer')}
          />
        ) : null}
        <Chip
          label={t('leaderboardTab')}
          selected={effectiveTab === 'leaderboard'}
          onPress={() => setTab('leaderboard')}
        />
      </View>

      {/* Score sheet */}
      <BottomSheet
        visible={scoringMatch != null}
        onClose={closeScoreModal}
        title={t('enterScoreTitle')}
        testID="score-sheet"
      >
        {scoringMatch != null ? (
          <>
            <Text style={styles.modalSide} numberOfLines={2}>
              {sideNames(scoringMatch.match_players, 'a')}
            </Text>
            <Text style={styles.vs}>{t('vsLabel')}</Text>
            <Text style={styles.modalSide} numberOfLines={2}>
              {sideNames(scoringMatch.match_players, 'b')}
            </Text>

            {isPoints ? (
              <>
                <Text style={styles.fieldLabel}>{t('sideALabel')}</Text>
                <TextInput
                  style={[styles.input, notPlayed && styles.inputDisabled]}
                  keyboardType="number-pad"
                  editable={!notPlayed}
                  value={sideAInput}
                  onChangeText={setSideAInput}
                />
                <Text style={styles.fieldLabel}>{t('sideBLabel')}</Text>
                <View style={[styles.input, styles.inputReadonly]}>
                  <Text style={styles.inputReadonlyText}>{computedSideB}</Text>
                </View>
                <Text style={styles.hint}>
                  {t('pointsTotalHint', { total: pointsTotal })}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>{t('sideALabel')}</Text>
                <TextInput
                  style={[styles.input, notPlayed && styles.inputDisabled]}
                  keyboardType="number-pad"
                  editable={!notPlayed}
                  value={sideAInput}
                  onChangeText={setSideAInput}
                />
                <Text style={styles.fieldLabel}>{t('sideBLabel')}</Text>
                <TextInput
                  style={[styles.input, notPlayed && styles.inputDisabled]}
                  keyboardType="number-pad"
                  editable={!notPlayed}
                  value={sideBInput}
                  onChangeText={setSideBInput}
                />
              </>
            )}

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('notPlayedToggle')}</Text>
              <Switch value={notPlayed} onValueChange={setNotPlayed} disabled={busy} />
            </View>

            {error != null ? <Text style={styles.error}>{t(error)}</Text> : null}

            <Button
              label={t('saveScoreCta')}
              fullWidth
              disabled={busy}
              onPress={() => onSaveScore(scoringMatch)}
            />
          </>
        ) : null}
      </BottomSheet>

      {/* Finish sheet */}
      <BottomSheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        title={allScored ? t('finishConfirmTitle') : t('finishEarlyTitle')}
        testID="finish-event-sheet"
      >
        <Text style={styles.modalBody}>
          {allScored ? t('finishConfirmBody') : t('finishEarlyBody')}
        </Text>

        <Text style={styles.fieldLabel}>{t('finishMessageLabel')}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder={t('finishMessagePlaceholder')}
          placeholderTextColor={palette.slate[400]}
          multiline
          maxLength={280}
          value={finishMessage}
          onChangeText={setFinishMessage}
        />

        {error != null ? <Text style={styles.error}>{t(error)}</Text> : null}

        {isPublicGroup ? (
          <View style={styles.modalActions}>
            <Button
              label={t('rankingExcludeCta')}
              variant="outline"
              disabled={busy}
              onPress={() => onFinish(false)}
            />
            <Button
              label={t('rankingIncludeCta')}
              disabled={busy}
              onPress={() => onFinish(true)}
            />
          </View>
        ) : (
          <Button
            label={t('finishCta')}
            disabled={busy}
            onPress={() => onFinish(undefined)}
          />
        )}
      </BottomSheet>

      <ShareResultsModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        eventId={id}
        communityId={event.group_id ? (group?.community_id ?? null) : null}
        summaryText={resultsSummary}
        eventName={event.name}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerBox: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  noAccessTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  noAccessBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },


  // Round tabs
  roundTabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  roundTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },

  content: { padding: 16, gap: 12 },
  empty: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', marginTop: 32 },

  // Match card
  matchCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchCardMine: { borderColor: colors.primary, borderWidth: 2 },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  courtLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
  },
  mineChip: { backgroundColor: palette.purple[100], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  mineChipText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  matchBody: { alignItems: 'center', gap: 4 },
  sideNames: { fontSize: 16, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
  score: { fontSize: 22, fontWeight: '800', color: colors.foreground },
  vs: { fontSize: 12, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase' },

  // Resting
  restingSection: { marginTop: 4, gap: 6 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  restingName: { fontSize: 15, color: colors.foreground, fontWeight: '500' },

  // Leaderboard
  board: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  boardHeaderRow: { borderTopWidth: 0, backgroundColor: colors.muted },
  boardHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
  },
  colRank: { width: 40, fontSize: 15, fontWeight: '700', color: colors.foreground },
  colPlayer: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
  colPoints: { width: 56, textAlign: 'right', fontSize: 15, fontWeight: '700', color: colors.foreground },
  colRecord: { width: 72, textAlign: 'right', fontSize: 14, color: colors.mutedForeground },

  // Segmented tabs
  segmentBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },

  // Buttons (shared with guard views)

  // Tap-to-score hint
  tapHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },

  // Floating finish button

  // Overview
  overview: { gap: 16 },
  overviewSection: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  finishMessageText: { fontSize: 15, color: colors.foreground, lineHeight: 21 },
  completedHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },

  // Sheet content (shared by the score sheet and the finish sheet)
  modalBody: { fontSize: 14, color: colors.mutedForeground, textAlign: 'center', marginBottom: 4 },
  modalSide: { fontSize: 16, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginTop: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  inputMultiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  inputDisabled: { backgroundColor: colors.muted, opacity: 0.6 },
  inputReadonly: { backgroundColor: colors.muted },
  inputReadonlyText: { fontSize: 16, color: colors.mutedForeground, fontWeight: '600' },
  hint: { fontSize: 12, color: palette.slate[400], marginTop: 4 },
  error: { fontSize: 14, color: colors.destructive, marginTop: 6, textAlign: 'center' },
});
