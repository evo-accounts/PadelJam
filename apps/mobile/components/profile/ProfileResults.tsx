/**
 * The Last results section of UX-PROF-01: both pairs, the court and the final score.
 *
 * Worth knowing while reading this next to the stats row above it: the "Played matches" number
 * there counts rows in `group_event_results` — finished RANKED GROUP events — while this counts
 * matches the engine recorded a score for. A standalone americano contributes to one and not the
 * other, so the two can legitimately disagree and neither is wrong.
 *
 * Which matches are visible at all is `event_is_visible`'s business, applied inside
 * `player_recent_results`, so this screen never becomes the one that widens event visibility.
 */
import { usePlayerResults } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { colors, space } from '../../theme';
import { Card, EmptyState, Text, emptyIcon } from '../ui';

export function ProfileResults({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const query = usePlayerResults(userId);
  const rows = query.data ?? [];

  if (query.isLoading) return null;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon('sportscourt')}
        title={t('resultsEmpty')}
        body={t('resultsEmptyBody')}
        testID="empty-profile-results"
      />
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((r) => {
        // The player's own side is reported by the RPC, so the score can be read in their favour
        // without the screen re-deriving who was where.
        const won =
          r.player_side === 'a' ? r.side_a_score > r.side_b_score : r.side_b_score > r.side_a_score;
        return (
          <Card key={r.match_id} padding="md" style={styles.card} testID={`result-${r.match_id}`}>
            <View style={styles.header}>
              <Text variant="caption" tone="muted" style={styles.flex}>
                {r.event_name}
              </Text>
              <Text variant="caption" tone="muted">
                {r.court_label}
              </Text>
            </View>
            <View style={styles.teams}>
              <Text variant="body" style={styles.flex}>
                {r.side_a_names.join(' · ')}
              </Text>
              <Text variant="bodyStrong" tone={won && r.player_side === 'a' ? 'success' : 'default'}>
                {r.side_a_score}
              </Text>
            </View>
            <View style={styles.teams}>
              <Text variant="body" style={styles.flex}>
                {r.side_b_names.join(' · ')}
              </Text>
              <Text variant="bodyStrong" tone={won && r.player_side === 'b' ? 'success' : 'default'}>
                {r.side_b_score}
              </Text>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
  card: { gap: space[1], backgroundColor: colors.card },
  header: { flexDirection: 'row', gap: space[2] },
  teams: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  flex: { flex: 1 },
});
