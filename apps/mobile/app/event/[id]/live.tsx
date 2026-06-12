import {
  useEvent,
  useEventMatches,
  useEventParticipants,
  useEventRealtime,
  useEventRounds,
  useEventStandings,
  useEventTeams,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const rounds = roundsData ?? [];
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [tab, setTab] = useState<'matches' | 'leaderboard'>('matches');

  const activeRoundId = selectedRoundId ?? lastRound?.id ?? null;

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
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
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryLabel}>{t('back')}</Text>
          </Pressable>
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
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryLabel}>{t('back')}</Text>
          </Pressable>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {event.status === 'completed' ? t('completedTitle') : t('liveTitle')}
        </Text>
        <View style={styles.backSpacer} />
      </View>

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
              <Pressable
                key={r.id}
                style={[styles.roundTab, active && styles.roundTabActive]}
                accessibilityRole="button"
                onPress={() => setSelectedRoundId(r.id)}
              >
                <Text style={[styles.roundTabText, active && styles.roundTabTextActive]}>
                  {t('roundLabel', { number: r.round_number })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'matches' ? (
          orderedMatches.length === 0 ? (
            <Text style={styles.empty}>{t('noMatches')}</Text>
          ) : (
            <>
              {orderedMatches.map((m) => {
                const isMine = m.id === myMatchId;
                return (
                  <View
                    key={m.id}
                    style={[styles.matchCard, isMine && styles.matchCardMine]}
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
                  </View>
                );
              })}

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
                ? t('teamLabel', { number: teamNumberById.get(s.entity_id) ?? 0 })
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

      {/* Bottom segmented tabs */}
      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, tab === 'matches' && styles.segmentActive]}
          accessibilityRole="button"
          onPress={() => setTab('matches')}
        >
          <Text style={[styles.segmentText, tab === 'matches' && styles.segmentTextActive]}>
            {t('matchesTab')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, tab === 'leaderboard' && styles.segmentActive]}
          accessibilityRole="button"
          onPress={() => setTab('leaderboard')}
        >
          <Text
            style={[styles.segmentText, tab === 'leaderboard' && styles.segmentTextActive]}
          >
            {t('leaderboardTab')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerBox: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  noAccessTitle: { fontSize: 20, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  noAccessBody: { fontSize: 15, color: '#6B7685', textAlign: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32 },
  backSpacer: { width: 20 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0B1F3A' },

  // Round tabs
  roundTabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  roundTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F0F3F8',
  },
  roundTabActive: { backgroundColor: '#0B7BFF' },
  roundTabText: { fontSize: 14, fontWeight: '600', color: '#6B7685' },
  roundTabTextActive: { color: '#fff' },

  content: { padding: 16, gap: 12 },
  empty: { fontSize: 15, color: '#6B7685', textAlign: 'center', marginTop: 32 },

  // Match card
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6EAF0',
  },
  matchCardMine: { borderColor: '#0B7BFF', borderWidth: 2 },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  courtLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A95A5',
    textTransform: 'uppercase',
  },
  mineChip: { backgroundColor: '#E6F0FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  mineChipText: { fontSize: 11, fontWeight: '700', color: '#0B7BFF' },
  matchBody: { alignItems: 'center', gap: 4 },
  sideNames: { fontSize: 16, fontWeight: '600', color: '#0B1F3A', textAlign: 'center' },
  score: { fontSize: 22, fontWeight: '800', color: '#0B1F3A' },
  vs: { fontSize: 12, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase' },

  // Resting
  restingSection: { marginTop: 4, gap: 6 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A95A5',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  restingName: { fontSize: 15, color: '#0B1F3A', fontWeight: '500' },

  // Leaderboard
  board: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
  },
  boardHeaderRow: { borderTopWidth: 0, backgroundColor: '#F0F3F8' },
  boardHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A95A5',
    textTransform: 'uppercase',
  },
  colRank: { width: 40, fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  colPlayer: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  colPoints: { width: 56, textAlign: 'right', fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  colRecord: { width: 72, textAlign: 'right', fontSize: 14, color: '#6B7685' },

  // Segmented tabs
  segmentBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
    backgroundColor: '#fff',
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F3F8',
  },
  segmentActive: { backgroundColor: '#0B1F3A' },
  segmentText: { fontSize: 15, fontWeight: '700', color: '#6B7685' },
  segmentTextActive: { color: '#fff' },

  // Buttons (shared with guard views)
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
