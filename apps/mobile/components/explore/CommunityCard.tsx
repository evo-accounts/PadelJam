import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';

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
 * A tappable community card: thumbnail, name, location and an optional inline
 * action. Presentational — the caller supplies the row, the open handler and
 * the action (`CommunityJoinAction` on Explore: Join / Request / Requested…).
 *
 * Two arrangements of the same content (UX-GLOB-09): `vertical` (the
 * default) is the fixed-width rail card — the same shape as
 * `SuggestedCommunityCard`, whose thumbnail-or-initial rendering it reuses via
 * `CommunityThumb` rather than reimplementing it; `horizontal` is a full-width
 * row for a list screen: a small thumbnail left, name + location middle, the
 * action (or a chevron) right.
 *
 * B1: this card used to decide its own action from `privacy` alone, so members
 * and people with a pending request were offered "Request to join" and public
 * communities got nothing. The action is the caller's now, driven by the row's
 * `viewer_state` (migration 0128).
 *
 * The action sits BESIDE the tappable body, never inside it: an accessible
 * Pressable swallows its children on iOS, so a nested button is unreachable to
 * VoiceOver and to the E2E driver.
 */
export function CommunityCard({
  community,
  onOpen,
  action,
  orientation = 'vertical',
  railWidth = 200,
}: {
  community: Community;
  onOpen: () => void;
  action?: React.ReactNode;
  orientation?: 'vertical' | 'horizontal';
  railWidth?: number;
}) {
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
      <View style={styles.cardHorizontal}>
        <Pressable
          style={styles.bodyHorizontal}
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
          {action ? null : (
            <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
              ›
            </Text>
          )}
        </Pressable>
        {action}
      </View>
    );
  }

  const cover = coverUrl(community.cover_image_path);
  return (
    <View style={[styles.card, { width: railWidth }]}>
      <Pressable style={styles.bodyVertical} onPress={onOpen} accessibilityRole="button" testID={`community-card-${community.id}`}>
        <CommunityThumb url={cover} name={community.name} style={styles.thumb} />
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        {location}
      </Pressable>
      {action}
    </View>
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
  bodyVertical: { gap: 6 },
  bodyHorizontal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { height: 80, borderRadius: 10, backgroundColor: colors.muted },
  thumbHorizontal: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
