/**
 * One row of Explore's search lists: a recent search (clock, query, ✕) or a suggestion (kind icon,
 * name, chevron). The tappable body and a `trailing` control are SIBLINGS, never nested: an
 * accessible Pressable swallows its children on iOS, so a ✕ inside it would be unreachable to
 * VoiceOver and to the E2E driver. A `chevron` is decorative and sits inside the body.
 */
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, space } from '../../../theme';

const ICONS = {
  clock: { ios: 'clock', android: 'schedule' },
  search: { ios: 'magnifyingglass', android: 'search' },
  player: { ios: 'person', android: 'person' },
  event: { ios: 'calendar', android: 'event' },
  community: { ios: 'building.2', android: 'location_city' },
  group: { ios: 'person.3', android: 'groups' },
} as const;

export type SearchRowIcon = keyof typeof ICONS;

export function SearchRow({
  icon,
  label,
  accessibilityLabel,
  onPress,
  chevron = false,
  trailing,
  testID,
}: {
  icon: SearchRowIcon;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  chevron?: boolean;
  trailing?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        testID={testID}
      >
        <SymbolView
          name={{ ...ICONS[icon], web: ICONS[icon].android } as never}
          size={16}
          tintColor={colors.mutedForeground}
        />
        <Text variant="body" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {chevron ? (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' } as never}
            size={14}
            tintColor={colors.mutedForeground}
          />
        ) : null}
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  pressed: { opacity: 0.6 },
  label: { flex: 1 },
});
