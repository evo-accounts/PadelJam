import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

export type CommunityMember = {
  user_id: string;
  role: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

const ROLE_KEY: Record<string, string> = {
  owner: 'aboutOwnerRole',
  admin: 'aboutAdminRole',
};

/** Single member roster row: avatar, name and a role badge for owner/admin. */
export function MemberRow({ member }: { member: CommunityMember }) {
  const { t } = useT('community');
  const name = member.profiles?.full_name ?? '—';
  const url = avatarUrl(member.profiles?.avatar_url);
  const roleKey = ROLE_KEY[member.role];

  return (
    <View style={styles.row}>
      {url ? (
        <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
        </View>
      )}
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  badge: { backgroundColor: '#EEF2F7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#3A4A60' },
});
