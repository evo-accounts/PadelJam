import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CommunityThumb } from '@/components/community/SuggestedCommunityCard';
import { coverUrl, thumbnailUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';

type Community = {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  location: string | null;
  cover_image_path?: string | null;
  thumbnail_path?: string | null;
};

/**
 * A tappable community card: thumbnail, name, location and (for a
 * request-to-join community) a join action. Presentational — the caller
 * supplies the row and the two handlers.
 *
 * Two arrangements of the same content (UX-GLOB-09): `vertical` (the
 * default, and the only look this card had before) is the fixed-width rail
 * card — the same shape as `SuggestedCommunityCard`, whose thumbnail-or-
 * initial rendering it reuses via `CommunityThumb` rather than
 * reimplementing it; `horizontal` is a full-width row for a list screen: a
 * small thumbnail left, name + location middle, the join action (or a
 * chevron) right.
 */
export function CommunityCard({
  community,
  onOpen,
  onRequestJoin,
  orientation = 'vertical',
  railWidth = 200,
}: {
  community: Community;
  onOpen: () => void;
  onRequestJoin: () => void;
  orientation?: 'vertical' | 'horizontal';
  railWidth?: number;
}) {
  const { t } = useT('discovery');
  const isRequest = community.privacy === 'request_to_join';

  const cta = isRequest ? (
    <Pressable
      style={styles.cta}
      onPress={onRequestJoin}
      accessibilityRole="button"
      testID={`community-card-cta-${community.id}`}
    >
      <Text style={styles.ctaText}>{t('requestToJoin')}</Text>
    </Pressable>
  ) : null;

  const location = community.location ? (
    <Text style={styles.meta} numberOfLines={1}>
      {community.location}
    </Text>
  ) : null;

  if (orientation === 'horizontal') {
    // Small inline thumbnail: the dedicated thumbnail bucket first, falling
    // back to the cover image (a different storage bucket — see
    // lib/community-images.ts) when only that is set.
    const url = thumbnailUrl(community.thumbnail_path) ?? coverUrl(community.cover_image_path);
    return (
      <Pressable
        style={styles.cardHorizontal}
        onPress={onOpen}
        accessibilityRole="button"
        testID={`community-card-${community.id}`}
      >
        <CommunityThumb url={url} name={community.name} style={styles.thumbHorizontal} />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {community.name}
          </Text>
          {location}
        </View>
        {cta ?? (
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            ›
          </Text>
        )}
      </Pressable>
    );
  }

  const cover = coverUrl(community.cover_image_path);
  return (
    <Pressable
      style={[styles.card, { width: railWidth }]}
      onPress={onOpen}
      accessibilityRole="button"
      testID={`community-card-${community.id}`}
    >
      <CommunityThumb url={cover} name={community.name} style={styles.thumb} />
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
      {location}
      {cta}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  cardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  thumb: { height: 80, borderRadius: 10, backgroundColor: colors.muted },
  thumbHorizontal: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground },
  cta: {
    borderRadius: 999,
    backgroundColor: palette.purple[100],
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  ctaText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
