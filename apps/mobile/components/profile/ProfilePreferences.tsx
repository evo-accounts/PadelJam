/**
 * The three Preferences cards of UX-PROF-01: dominant hand, court side, preferred time.
 *
 * All three are ALWAYS rendered. The audit is explicit — "show every card even when the user has
 * not filled it in; an unset preference shows its empty state, not a hidden card" — and that is the
 * whole point of the section: a profile with nothing filled in should still read as a profile with
 * three preferences it does not know yet, not as a screen that is missing a section.
 *
 * The values come straight off `get_player_profile`, which already returns all three.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { colors, space } from '../../theme';
import { Card, Text } from '../ui';

type Props = {
  dominantHand: string | null;
  courtSide: string | null;
  preferredTime: string | null;
};

export function ProfilePreferences({ dominantHand, courtSide, preferredTime }: Props) {
  const { t } = useT('profile');

  // The stored values are the database's check-constraint literals; the copy keys are camelCase.
  const hand = dominantHand === 'left' ? t('handLeft') : dominantHand === 'right' ? t('handRight') : null;
  const side = courtSide === 'left' ? t('sideLeft') : courtSide === 'right' ? t('sideRight') : null;
  const time =
    preferredTime === 'any' ? t('timeAny')
    : preferredTime === 'morning' ? t('timeMorning')
    : preferredTime === 'afternoon' ? t('timeAfternoon')
    : preferredTime === 'night' ? t('timeNight')
    : null;

  const cards: { key: string; label: string; value: string | null }[] = [
    { key: 'hand', label: t('handLabel'), value: hand },
    { key: 'side', label: t('sideLabel'), value: side },
    { key: 'time', label: t('timeLabel'), value: time },
  ];

  return (
    <View style={styles.row}>
      {cards.map((c) => (
        <Card key={c.key} padding="md" style={styles.card} testID={`preference-${c.key}`}>
          <Text variant="caption" tone="muted">
            {c.label}
          </Text>
          <Text variant="bodyStrong" tone={c.value ? 'default' : 'muted'}>
            {c.value ?? t('preferenceUnset')}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[2] },
  // Equal thirds: the three labels are different lengths, and a hugging card would make the row
  // look like it had been sorted by name.
  card: { flex: 1, gap: space[1], backgroundColor: colors.card },
});
