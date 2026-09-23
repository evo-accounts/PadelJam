/**
 * One badge, as a medal.
 *
 * Named `BadgeMedal`, not `Badge`: `components/ui/Badge` already exists and is a static status
 * pill imported across the app. Two things called Badge in one codebase is a rename waiting to
 * happen at the worst moment.
 *
 * A LOCKED badge is shown, not hidden — the whole point of a catalogue is that you can see what
 * you have not earned yet. It is greyed and its accessible name says so, because opacity alone
 * does not reach a screen reader, and "Mix Master" announced identically whether earned or not is
 * the kind of thing that reads fine and tests fine and is wrong.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import type { BadgeState } from '@padel/utils';

import { colors, radius, space } from '../../theme';
import { Text } from '../ui';

/** One SF Symbol per category, so a badge looks like its family at a glance. */
const ICONS: Record<string, [string, string]> = {
  gettingStarted: ['flag', 'flag'],
  loyalty: ['calendar', 'calendar_month'],
  engagement: ['flame', 'local_fire_department'],
  skill: ['trophy', 'emoji_events'],
  social: ['person.2', 'group'],
  communities: ['building.2', 'groups'],
  competition: ['medal', 'military_tech'],
  rare: ['star.circle', 'workspace_premium'],
};

export function BadgeMedal({
  state,
  showProgress = false,
  testID,
}: {
  state: BadgeState;
  showProgress?: boolean;
  testID?: string;
}) {
  const { t } = useT('profile');
  const [ios, android] = ICONS[state.category] ?? ['star', 'star'];
  const name = t(`badge_${state.id}` as never);

  // The accessible name carries everything colour and opacity carry visually: which badge, whether
  // it is earned, and which tier of how many when it is tiered.
  const label = state.unlocked
    ? state.tiers > 1
      ? t('badgeEarnedTier', { name, tier: state.tier, total: state.tiers })
      : t('badgeEarned', { name })
    : t('badgeLocked', { name });

  return (
    <View style={styles.wrap} accessible accessibilityLabel={label} testID={testID}>
      <View style={[styles.medal, !state.unlocked && styles.locked]}>
        <SymbolView
          name={{ ios, android, web: android } as never}
          size={26}
          tintColor={state.unlocked ? colors.primary : colors.mutedForeground}
        />
      </View>
      <Text
        variant="hint"
        tone={state.unlocked ? 'default' : 'muted'}
        numberOfLines={2}
        style={styles.name}
      >
        {name}
      </Text>
      {showProgress && !state.unlocked && state.next ? (
        <Text variant="hint" tone="muted" style={styles.name}>
          {t('badgeProgress', { value: state.value, next: state.next })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 88, alignItems: 'center', gap: space[1] },
  medal: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: { opacity: 0.45 },
  name: { textAlign: 'center' },
});
