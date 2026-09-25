import type { GroupRankingRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

import { colors, radius, space } from '../../theme';
import { Avatar, Badge, Text } from '../ui';

export type RankingRow = GroupRankingRow;

/** What the table can be sorted by. `points` is the ranking itself. */
export type RankingSort = 'points' | 'wins' | 'events';

/**
 * Two column sets of the same table:
 *   preview  the group page's top 10 — Points / W / L (UX-GRP-04)
 *   full     the Ranking screen — Points / Events played (UX-GRP-06)
 */
export type RankingVariant = 'preview' | 'full';

/**
 * Re-orders rows for a sort other than points. Position (`rank`) always stays the ranking's own —
 * sorting by wins shows who won most, it does not re-rank the season.
 */
export function sortRanking(rows: RankingRow[], sort: RankingSort): RankingRow[] {
  if (sort === 'points') return rows;
  const key = sort === 'wins' ? (r: RankingRow) => r.wins : (r: RankingRow) => r.eventsPlayed;
  return [...rows].sort((a, b) => key(b) - key(a) || a.rank - b.rank);
}

/**
 * The group leaderboard. Someone who has left the group stays in it — their points were earned —
 * in greyscale with a "No longer in group" tag (decision 2 of the Groups audit plan).
 * Presentational; an empty `rows` is the caller's empty state, not this component's.
 */
export function RankingList({
  rows,
  variant,
  onPressRow,
}: {
  rows: RankingRow[];
  variant: RankingVariant;
  onPressRow?: (userId: string) => void;
}) {
  const { t } = useT('group');
  const cols =
    variant === 'preview'
      ? [
          { key: 'points', header: t('rankingPointsHeader'), value: (r: RankingRow) => r.points },
          { key: 'wins', header: t('rankingWinsHeader'), value: (r: RankingRow) => r.wins },
          { key: 'losses', header: t('rankingLossesHeader'), value: (r: RankingRow) => r.losses },
        ]
      : [
          { key: 'points', header: t('rankingPointsHeader'), value: (r: RankingRow) => r.points },
          { key: 'events', header: t('rankingEventsHeader'), value: (r: RankingRow) => r.eventsPlayed },
        ];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text variant="hint" tone="subtle" style={styles.rankCol}>
          {t('rankingRankHeader')}
        </Text>
        <Text variant="hint" tone="subtle" style={styles.playerCol}>
          {t('rankingPlayerHeader')}
        </Text>
        {cols.map((c) => (
          <Text key={c.key} variant="hint" tone="subtle" style={styles.numCol}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row) => {
        const name = row.name ?? '—';
        const content = (
          <>
            <Text variant="label" tone={row.isMember ? 'primary' : 'subtle'} style={styles.rankCol}>
              {row.rank}
            </Text>
            <View style={[styles.playerCol, styles.player]}>
              <Avatar
                uri={avatarUrl(row.avatarUrl)}
                name={name}
                colourKey={row.userId}
                size="sm"
                decorative
                greyscale={!row.isMember}
              />
              <View style={styles.playerText}>
                <Text variant="label" tone={row.isMember ? 'default' : 'muted'} numberOfLines={1}>
                  {name}
                </Text>
                {row.isMember ? null : <Badge label={t('departedTag')} style={styles.tag} />}
              </View>
            </View>
            {cols.map((c) => (
              <Text key={c.key} variant="label" tone={row.isMember ? 'default' : 'muted'} style={styles.numCol}>
                {c.value(row)}
              </Text>
            ))}
          </>
        );
        return onPressRow ? (
          <Pressable
            key={row.userId}
            style={styles.row}
            onPress={() => onPressRow(row.userId)}
            accessibilityRole="button"
            accessibilityLabel={t('rankingRowA11y', {
              rank: row.rank,
              name,
              points: row.points,
            })}
          >
            {content}
          </Pressable>
        ) : (
          <View key={row.userId} style={styles.row}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: space[2] },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2] },
  rankCol: { width: 28 },
  playerCol: { flex: 1 },
  numCol: { width: 44, textAlign: 'right' },
  player: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  playerText: { flex: 1, alignItems: 'flex-start' },
  tag: { marginTop: space[1] },
});
