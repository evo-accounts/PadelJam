import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

import { RankingPlaceholder } from './RankingPlaceholder';
import { colors, palette } from '../../theme';
import { Avatar } from '../ui';

/** A single leaderboard row. Fed empty for now; populated once Events lands. */
export type RankingRow = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  points: number;
  eventsPlayed: number;
  rank: number;
};

/**
 * Points / leaderboard layout for a group season. Renders the RankingPlaceholder
 * when `rows` is empty. Presentational — no data source yet.
 */
export function RankingList({ rows }: { rows: RankingRow[] }) {
  const { t } = useT('group');

  if (rows.length === 0) {
    return <RankingPlaceholder />;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, styles.rankCol]}>{t('rankingRankHeader')}</Text>
        <Text style={[styles.headerText, styles.playerCol]}>{t('rankingPlayerHeader')}</Text>
        <Text style={[styles.headerText, styles.pointsCol]}>{t('rankingPointsHeader')}</Text>
      </View>
      {rows.map((row) => {
        const name = row.name ?? '—';
        return (
          <View key={row.userId} style={styles.row}>
            <Text style={[styles.rank, styles.rankCol]}>{row.rank}</Text>
            <View style={[styles.playerCol, styles.player]}>
              <Avatar uri={avatarUrl(row.avatarUrl)} name={name} colourKey={row.userId} size="md" />
              <View style={styles.playerText}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.events}>
                  {t('rankingEventsPlayed', { count: row.eventsPlayed })}
                </Text>
              </View>
            </View>
            <Text style={[styles.points, styles.pointsCol]}>{row.points}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, paddingVertical: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { fontSize: 12, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  rankCol: { width: 32 },
  playerCol: { flex: 1 },
  pointsCol: { width: 56, textAlign: 'right' },
  rank: { fontSize: 16, fontWeight: '700', color: colors.primary },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  events: { fontSize: 12, color: palette.slate[400], marginTop: 2 },
  points: { fontSize: 16, fontWeight: '700', color: colors.foreground },
});
