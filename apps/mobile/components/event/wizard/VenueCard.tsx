import type { VenueSearchRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { venueImageUrl } from '@/lib/community-images';

import { colors, palette, radius, space } from '../../../theme';
import { Text } from '../../ui';

const THUMB = space[16];

/**
 * A registry venue in the Location step's list (UX-CEVT-06): image (or a placeholder), name,
 * address and number of courts. Horizontal, per UX-GLOB-09 — this is a list, not a rail: image
 * left, text middle, chevron right. The whole card is one button, so VoiceOver reads the name,
 * address and court count together.
 */
export function VenueCard({
  venue,
  selected,
  onPress,
}: {
  venue: VenueSearchRow;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useT('event');
  const url = venueImageUrl(venue.image_path);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={`venue-card-${venue.id}`}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <SymbolView
            name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } as never}
            size={24}
            tintColor={colors.mutedForeground}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      )}
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {venue.name}
        </Text>
        {venue.address ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {venue.address}
          </Text>
        ) : null}
        <Text variant="hint" tone="muted">
          {t('venueCourtCount', { count: venue.court_count })}
        </Text>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' } as never}
        size={14}
        tintColor={colors.mutedForeground}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  pressed: { opacity: 0.85 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  placeholder: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: space[1] },
});
