import type { Tables } from '@padel/db';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';

export type CommunityRow = Tables<'communities'>;

export type Membership = {
  role: 'owner' | 'admin' | 'member' | string;
  community: CommunityRow;
};

type Props = {
  memberships: Membership[];
  defaultCommunityId: string | null;
  canCreate: boolean;
  onOpen: (id: string) => void;
  onSetDefault: (community: CommunityRow) => void;
  onNewCommunity: () => void;
};

function CommunityListItem({
  community,
  isDefault,
  onOpen,
  onSetDefault,
}: {
  community: CommunityRow;
  isDefault: boolean;
  onOpen: () => void;
  onSetDefault: () => void;
}) {
  const { t } = useT('community');
  const url = thumbnailUrl(community.thumbnail_path);

  return (
    <Pressable
      style={styles.item}
      onPress={onOpen}
      onLongPress={onSetDefault}
      accessibilityRole="button"
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{community.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.itemBody}>
        <Text style={styles.itemName} numberOfLines={1}>
          {community.name}
        </Text>
        {isDefault ? (
          <Text style={styles.defaultBadge}>★ {t('defaultBadge')}</Text>
        ) : null}
      </View>
      {!isDefault ? (
        <Pressable
          hitSlop={8}
          onPress={onSetDefault}
          accessibilityRole="button"
          accessibilityLabel={t('setAsDefault')}
        >
          <Text style={styles.star}>☆</Text>
        </Pressable>
      ) : (
        <Text style={[styles.star, styles.starActive]}>★</Text>
      )}
    </Pressable>
  );
}

export function CommunitySwitcher({
  memberships,
  defaultCommunityId,
  canCreate,
  onOpen,
  onSetDefault,
  onNewCommunity,
}: Props) {
  const { t } = useT('community');
  const [showArchived, setShowArchived] = useState(false);

  const { managing, participating } = useMemo(() => {
    const filtered = memberships.filter((m) =>
      showArchived ? m.community.archived_at != null : m.community.archived_at == null,
    );
    return {
      managing: filtered.filter((m) => m.role === 'owner' || m.role === 'admin'),
      participating: filtered.filter((m) => m.role === 'member'),
    };
  }, [memberships, showArchived]);

  const renderSection = (heading: string, rows: Membership[]) => {
    if (rows.length === 0) return null;
    return (
      <View style={styles.section} key={heading}>
        <Text style={styles.sectionTitle}>{heading}</Text>
        {rows.map((m) => (
          <CommunityListItem
            key={m.community.id}
            community={m.community}
            isDefault={m.community.id === defaultCommunityId}
            onOpen={() => onOpen(m.community.id)}
            onSetDefault={() => onSetDefault(m.community)}
          />
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('title')}</Text>

      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleBtn, !showArchived && styles.toggleBtnActive]}
          onPress={() => setShowArchived(false)}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, !showArchived && styles.toggleTextActive]}>
            {t('active')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, showArchived && styles.toggleBtnActive]}
          onPress={() => setShowArchived(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, showArchived && styles.toggleTextActive]}>
            {t('archived')}
          </Text>
        </Pressable>
      </View>

      {renderSection(t('managing'), managing)}
      {renderSection(t('participating'), participating)}

      {canCreate ? (
        <Pressable style={styles.newBtn} onPress={onNewCommunity} accessibilityRole="button">
          <Text style={styles.newBtnText}>{t('newCommunity')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: colors.foreground, marginBottom: 20 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.card },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.mutedForeground },
  toggleTextActive: { color: colors.foreground },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.muted },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarText: { color: colors.card, fontSize: 20, fontWeight: '700' },
  itemBody: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  defaultBadge: { marginTop: 2, fontSize: 12, color: palette.yellow[500], fontWeight: '600' },
  star: { fontSize: 22, color: palette.slate[400] },
  starActive: { color: palette.yellow[500] },
  newBtn: {
    borderWidth: 1,
    borderColor: colors.foreground,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  newBtnText: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
});
