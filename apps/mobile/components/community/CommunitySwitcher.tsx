import type { Tables } from '@padel/db';
import { useT } from '@padel/i18n';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';
import { Avatar, Button, Chip, IconButton } from '../../components/ui';

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

  return (
    <Pressable
      style={styles.item}
      onPress={onOpen}
      onLongPress={onSetDefault}
      accessibilityRole="button"
    >
      <Avatar
        uri={thumbnailUrl(community.thumbnail_path)}
        name={community.name}
        colourKey={community.id}
        size="lg"
        decorative
      />
      <View style={styles.itemBody}>
        <Text style={styles.itemName} numberOfLines={1}>
          {community.name}
        </Text>
        {isDefault ? (
          <Text style={styles.defaultBadge}>★ {t('defaultBadge')}</Text>
        ) : null}
      </View>
      {!isDefault ? (
        <IconButton
          icon="☆"
          accessibilityLabel={t('setAsDefault')}
          size="sm"
          onPress={onSetDefault}
        />
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
      <View style={styles.toggle}>
        <Chip
          label={t('active')}
          selected={!showArchived}
          onPress={() => setShowArchived(false)}
        />
        <Chip
          label={t('archived')}
          selected={showArchived}
          onPress={() => setShowArchived(true)}
        />
      </View>

      {renderSection(t('managing'), managing)}
      {renderSection(t('participating'), participating)}

      {canCreate ? (
        <Button label={t('newCommunity')} variant="outline" fullWidth onPress={onNewCommunity} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
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
  itemBody: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  defaultBadge: { marginTop: 2, fontSize: 12, color: palette.yellow[500], fontWeight: '600' },
  star: { fontSize: 22, color: palette.slate[400] },
  starActive: { color: palette.yellow[500] },
});
