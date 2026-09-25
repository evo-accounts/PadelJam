import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';

import { colors, radius, space } from '../../theme';
import { Text } from '../ui';

/**
 * The group's identity in the header, messaging-app style (UX-GRP-02/04): a small thumbnail, the
 * name, and the description as a subtitle, all on one line beside the back button. Replaces the
 * large centred block (`GroupHeader`) that pushed the content below the fold.
 *
 * Rendered in `TopBar`'s `centre` slot; it aligns left inside that slot.
 */
export function GroupIdentity({
  name,
  description,
  thumbnailPath,
}: {
  name: string;
  description?: string | null;
  thumbnailPath?: string | null;
}) {
  const thumb = thumbnailUrl(thumbnailPath);
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={name}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.fallback]}>
          <Text variant="label" tone="inverse">
            {(name.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.text}>
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        {description ? (
          <Text variant="hint" tone="muted" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const THUMB = 36;

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.full, backgroundColor: colors.muted },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  text: { flex: 1 },
});
