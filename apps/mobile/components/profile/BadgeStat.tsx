/**
 * The third stat card: how many badges this player has earned, and the way into the full list.
 *
 * It matches the two beside it in shape but is the only one that navigates, because a count of a
 * catalogue implies a catalogue to look at. The two static cards stay static — "12 matches" has
 * nowhere to go.
 *
 * While the query is in flight it renders an em dash rather than 0. Zero is a real and meaningful
 * value here (a new account has earned nothing), so showing it before it is known would state
 * something false for a moment — the same reason the plan label in Settings stays neutral until
 * `useAccountPlan` resolves.
 */
import { usePlayerBadgeFacts } from '@padel/api';
import { evaluateBadges, type BadgeFacts } from '@padel/utils';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { space } from '../../theme';
import { Text } from '../ui';

export function BadgeStat({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const router = useRouter();
  const q = usePlayerBadgeFacts(userId);

  const earned = q.data
    ? evaluateBadges(q.data as BadgeFacts).filter((s) => s.unlocked).length
    : null;

  return (
    <Pressable
      style={styles.stat}
      onPress={() => router.push(`/profile/${userId}/badges`)}
      accessibilityRole="button"
      accessibilityLabel={
        earned === null ? t('badgesTitle') : t('badgesEarnedCount', { count: earned })
      }
      testID="profile-badges-stat"
    >
      <Text variant="title">{earned ?? '—'}</Text>
      <Text variant="caption" tone="muted">
        {t('badgesTitle')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stat: { alignItems: 'center', gap: space[1] },
});
