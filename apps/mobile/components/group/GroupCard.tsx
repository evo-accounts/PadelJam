import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';

/** Minimal group row shape used to render a card in a list. */
export type GroupCardGroup = {
  id: string;
  name: string;
  thumbnail_path: string | null;
  is_private: boolean;
  is_general: boolean;
  archived_at: string | null;
};

/**
 * A tappable row/card for a group in a list: thumbnail, name, applicable tags
 * (General / Private / Archived) and an optional member count. Presentational —
 * the caller supplies the group row and an onPress handler.
 */
export function GroupCard({
  group,
  memberCount,
  onPress,
}: {
  group: GroupCardGroup;
  memberCount?: number;
  onPress?: () => void;
}) {
  const { t } = useT('group');
  const thumb = thumbnailUrl(group.thumbnail_path);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
    >
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
        <View style={styles.tags}>
          {group.is_general ? <Tag label={t('generalGroup')} /> : null}
          {group.is_private ? <Tag label={t('privateTag')} /> : null}
          {group.archived_at ? <Tag label={t('archivedTag')} muted /> : null}
          {typeof memberCount === 'number' ? (
            <Text style={styles.members}>{t('membersPill', { count: memberCount })}</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
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
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  thumbInitial: { color: colors.card, fontSize: 22, fontWeight: '700' },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagMuted: { backgroundColor: colors.background },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground },
  tagTextMuted: { color: palette.slate[400] },
  members: { fontSize: 12, color: palette.slate[400], fontWeight: '600' },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
