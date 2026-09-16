/**
 * The community switcher (UX-COMM-09).
 *
 * A bottom sheet, not a screen: the community IS the tab now, so switching is a
 * change of context rather than a navigation. Every community the user belongs
 * to, the active one marked, and "New community" as the last row.
 *
 * Archived communities sit in their own section and are shown to ADMINS only —
 * a member of an archived community has nothing to do there, while an admin
 * needs the way back in to unarchive it.
 *
 * Always available. The audit is explicit that plan limits do not apply to
 * creating a community during the MVP, and migration 0098 lifted the cap that
 * used to say otherwise, so "New community" is never hidden or disabled here.
 */
import type { Tables } from '@padel/db';
import { useT } from '@padel/i18n';
import { ScrollView, StyleSheet, View } from 'react-native';

import { thumbnailUrl } from '@/lib/community-images';
import { Avatar, BottomSheet, SheetRow, Text } from '../ui';
import { space } from '../../theme';

export type CommunityRow = Tables<'communities'>;
export type Membership = { role: string; community: CommunityRow };

type Props = {
  visible: boolean;
  onClose: () => void;
  memberships: Membership[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewCommunity: () => void;
};

export function CommunitySwitcherSheet({
  visible,
  onClose,
  memberships,
  activeId,
  onSelect,
  onNewCommunity,
}: Props) {
  const { t } = useT('community');

  const active = memberships.filter((m) => !m.community.archived_at);
  // Admin-only, per UX-COMM-09.
  const archived = memberships.filter((m) => m.community.archived_at && m.role === 'admin');

  const row = (m: Membership) => {
    const isActive = m.community.id === activeId;
    // Two literal t() calls rather than t(keyFor(role)). scripts/check-i18n-keys.mjs
    // only sees LITERAL keys — a computed one is skipped, which is how this
    // shipped rendering the raw string "roleAdmin" to users with every gate
    // green. Keep them literal so the checker can do its job.
    const roleLabel = m.role === 'admin' ? t('roleAdmin') : t('roleMember');

    return (
    <SheetRow
      key={m.community.id}
      label={m.community.name}
      selected={isActive}
      onPress={() => onSelect(m.community.id)}
      leading={
        <Avatar
          uri={thumbnailUrl(m.community.thumbnail_path)}
          name={m.community.name}
          colourKey={m.community.id}
          size="sm"
          decorative
        />
      }
      trailing={
        <View style={styles.trailing}>
          {/* ListRow's `selected` only sets accessibilityState, so the active
              community is announced but invisible. UX-COMM-09 wants it marked. */}
          {isActive ? (
            <Text variant="hint" tone="primary">
              ✓
            </Text>
          ) : null}
          <Text variant="hint" tone="muted">
            {roleLabel}
          </Text>
        </View>
      }
      testID={`switcher-community-${m.community.id}`}
    />
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('switcherTitle')} testID="community-switcher">
      <ScrollView>
        {active.map(row)}

        {archived.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted" style={styles.sectionTitle}>
              {t('switcherArchived')}
            </Text>
            {archived.map(row)}
          </View>
        ) : null}

        <SheetRow
          label={t('newCommunity')}
          onPress={onNewCommunity}
          testID="switcher-new-community"
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space[4] },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  sectionTitle: { paddingHorizontal: space[4], marginBottom: space[2] },
});
