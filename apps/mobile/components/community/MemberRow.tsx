import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../theme';
import { Avatar } from '../ui';

export type CommunityMember = {
  user_id: string;
  role: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

const ROLE_KEY: Record<string, string> = {
  admin: 'aboutAdminRole',
};

/** Single member roster row: avatar, name and a role badge for admins. */
export function MemberRow({ member }: { member: CommunityMember }) {
  const { t } = useT('community');
  const name = member.profiles?.full_name ?? '—';
  const roleKey = ROLE_KEY[member.role];

  return (
    <View style={styles.row}>
      <Avatar
        uri={avatarUrl(member.profiles?.avatar_url)}
        name={name}
        colourKey={member.user_id}
        size="md"
        decorative
      />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {roleKey ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t(roleKey)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.foreground },
  badge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
});
