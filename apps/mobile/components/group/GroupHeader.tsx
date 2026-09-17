import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';

import { SeasonTag } from './SeasonTag';
import { colors } from '../../theme';

/**
 * Group page hero: thumbnail, name, optional description, a member-count pill
 * and the current SeasonTag. Render-only — props in, no data fetching.
 *
 * It used to be described as mirroring `CommunityHero`, which is gone: the
 * community identity block moved into the About tab (UX-COMM-08) and the
 * preview's own header (UX-COMM-04). Groups have no equivalent restructure yet,
 * so this stayed.
 */
export function GroupHeader({
  name,
  description,
  thumbnailPath,
  memberCount,
  seasonNumber,
  isPrivate,
}: {
  name: string;
  description?: string | null;
  thumbnailPath?: string | null;
  memberCount: number;
  seasonNumber?: number | null;
  isPrivate?: boolean;
}) {
  const { t } = useT('group');
  const thumb = thumbnailUrl(thumbnailPath);

  return (
    <View style={styles.container}>
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {description ? (
        <Text style={styles.description} numberOfLines={4}>
          {description}
        </Text>
      ) : null}
      <View style={styles.pills}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{t('membersPill', { count: memberCount })}</Text>
        </View>
        {isPrivate ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{t('privateTag')}</Text>
          </View>
        ) : null}
        {typeof seasonNumber === 'number' ? <SeasonTag number={seasonNumber} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.card, paddingBottom: 16, paddingTop: 16, alignItems: 'center' },
  thumbWrap: {
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.card,
    overflow: 'hidden',
  },
  thumb: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.muted },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  thumbInitial: { color: colors.card, fontSize: 30, fontWeight: '700' },
  name: { marginTop: 10, fontSize: 22, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  description: {
    marginTop: 6,
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  pills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground },
});
