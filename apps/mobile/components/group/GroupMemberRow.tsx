import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../theme';
import { Avatar } from '../ui';

/** Group member shape returned by `useGroupMembers`. */
export type GroupMember = {
  user_id: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

/**
 * Single group member roster row: avatar + full name, with an optional trailing
 * slot (e.g. a remove button or chevron) and an optional row press handler.
 * Presentational — the trailing action is supplied by the caller.
 */
export function GroupMemberRow({
  member,
  trailing,
  onPress,
}: {
  member: GroupMember;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const name = member.profiles?.full_name ?? '—';

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
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
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
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
  trailing: { marginLeft: 'auto' },
});
