import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';

/**
 * Minimal group row shape used to render a card in a list.
 *
 * `community_name` is optional: most callers already scope the list to one
 * community, so there is nothing to say. Home's "My Groups" spans several
 * communities, so it supplies it and the card shows a second line.
 */
export type GroupCardGroup = {
  id: string;
  name: string;
  thumbnail_path?: string | null;
  is_private?: boolean;
  is_general?: boolean;
  archived_at?: string | null;
  community_name?: string | null;
};

/**
 * A tappable group card: thumbnail, name, applicable tags (General / Private /
 * Archived) and an optional member count. Presentational — the caller supplies
 * the group row and an onPress handler.
 *
 * One `GroupCard` for both arrangements (UX-GLOB-09), replacing the separate
 * `explore/GroupCard` (vertical-only rail card): `vertical` is a fixed-width
 * card for a rail (thumbnail on top, name below); `horizontal` (the default)
 * is the full-width row this component always was. Same content either way —
 * only the layout switches.
 *
 * `action` (UX-EXPL-02: Join on Explore) sits BESIDE the tappable body, never
 * inside it: an accessible Pressable swallows its children on iOS, so a nested
 * button is unreachable to VoiceOver and to the E2E driver. With an action the
 * card is a plain View holding the body and the action as siblings.
 */
export function GroupCard({
  group,
  memberCount,
  onPress,
  orientation = 'horizontal',
  railWidth = 160,
  action,
}: {
  group: GroupCardGroup;
  memberCount?: number;
  onPress?: () => void;
  action?: React.ReactNode;
  orientation?: 'vertical' | 'horizontal';
  railWidth?: number;
}) {
  const { t } = useT('group');
  const thumb = thumbnailUrl(group.thumbnail_path);

  if (orientation === 'vertical') {
    const body = (
      <>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={styles.thumbVertical}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.thumbVertical, styles.thumbFallback]}>
            <Text style={styles.thumbInitial}>{(group.name.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.nameVertical} numberOfLines={2}>
          {group.name}
        </Text>
      </>
    );
    if (action) {
      return (
        <View style={[styles.cardVertical, { width: railWidth }]}>
          <Pressable
            style={styles.bodyVertical}
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole="button"
            testID={`group-card-${group.id}`}
          >
            {body}
          </Pressable>
          {action}
        </View>
      );
    }
    return (
      <Pressable
        style={[styles.cardVertical, { width: railWidth }]}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        testID={`group-card-${group.id}`}
      >
        {body}
      </Pressable>
    );
  }

  const body = (
    <>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbInitial}>{(group.name.charAt(0) || '?').toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        {group.community_name ? (
          <Text style={styles.community} numberOfLines={1}>
            {group.community_name}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {group.is_general ? <Tag label={t('generalGroup')} /> : null}
          {group.is_private ? <Tag label={t('privateTag')} /> : null}
          {group.archived_at ? <Tag label={t('archivedTag')} muted /> : null}
          {typeof memberCount === 'number' ? (
            <Text style={styles.members}>{t('membersPill', { count: memberCount })}</Text>
          ) : null}
        </View>
      </View>
    </>
  );

  if (action) {
    return (
      <View style={styles.card}>
        <Pressable
          style={styles.bodyHorizontal}
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole="button"
          testID={`group-card-${group.id}`}
        >
          {body}
        </Pressable>
        {action}
      </View>
    );
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      testID={`group-card-${group.id}`}
    >
      {body}
      <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
  );
}

function Tag({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View style={[styles.tag, muted && styles.tagMuted]}>
      <Text style={[styles.tagText, muted && styles.tagTextMuted]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  cardVertical: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  bodyVertical: { gap: 6 },
  bodyHorizontal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted },
  thumbVertical: { height: 72, borderRadius: 10, backgroundColor: colors.muted },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  thumbInitial: { color: colors.card, fontSize: 22, fontWeight: '700' },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  nameVertical: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  community: { fontSize: 12, color: colors.mutedForeground, fontWeight: '600' },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagMuted: { backgroundColor: colors.background },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground },
  tagTextMuted: { color: palette.slate[400] },
  members: { fontSize: 12, color: palette.slate[400], fontWeight: '600' },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
