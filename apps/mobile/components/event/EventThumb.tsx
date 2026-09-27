/**
 * An event's image, or an icon placeholder — never an empty grey block (UX-JEVT-01/02, B13:
 * `thumbnail_path` used to be uploaded and rendered nowhere).
 *
 * Decorative in every shape: the event name is always right beside or below it.
 */
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { eventThumbnailUrl } from '@/lib/community-images';

import { colors, palette, radius } from '../../theme';

export type EventThumbShape = 'row' | 'rail' | 'hero';

const ICON: Record<EventThumbShape, number> = { row: 24, rail: 32, hero: 48 };

export function EventThumb({
  path,
  shape,
  style,
}: {
  path: string | null | undefined;
  shape: EventThumbShape;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = eventThumbnailUrl(path);
  const box = [styles.base, styles[shape], style];
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={box as never}
        contentFit="cover"
        transition={150}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  return (
    <View style={[box, styles.placeholder]} accessibilityElementsHidden importantForAccessibility="no">
      <SymbolView
        name={{ ios: 'sportscourt', android: 'sports_tennis', web: 'sports_tennis' } as never}
        size={ICON[shape]}
        tintColor={colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: palette.purple[100], overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  row: { width: 52, height: 52, borderRadius: radius.lg },
  rail: { height: 96 },
  hero: { height: 180, borderRadius: radius.xl },
});
