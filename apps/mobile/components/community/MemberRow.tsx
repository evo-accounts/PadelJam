/**
 * A single roster row: photo, name, role, and a chevron (UX-COMM-11).
 *
 * It was a hand-rolled Pressable-less View with its own row styles. `ListRow` is
 * the primitive for exactly this shape, and taking it means the row gets the
 * accessibility behaviour that was worked out there rather than a second,
 * slightly different version of it — in particular a decorative trailing glyph
 * that is NOT announced, which a bare `›` in a Text node would be.
 *
 * The role moves from a badge to the subtitle. A badge beside a chevron reads as
 * two trailing things competing, and "Admin" is a fact about the person rather
 * than a status needing a tint.
 */
import { useT } from '@padel/i18n';

import { avatarUrl } from '@/lib/community-images';
import { Avatar, ListRow, Text } from '../ui';

export type CommunityMember = {
  user_id: string;
  role: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

const ROLE_KEY: Record<string, string> = {
  admin: 'aboutAdminRole',
};

export function MemberRow({
  member,
  onPress,
}: {
  member: CommunityMember;
  /** Omitted where the row is not a destination — it then renders as a plain row. */
  onPress?: () => void;
}) {
  const { t } = useT('community');
  const name = member.profiles?.full_name ?? '—';
  const roleKey = ROLE_KEY[member.role];

  return (
    <ListRow
      title={name}
      subtitle={roleKey ? t(roleKey) : undefined}
      variant="plain"
      onPress={onPress}
      leading={
        <Avatar
          uri={avatarUrl(member.profiles?.avatar_url)}
          name={name}
          colourKey={member.user_id}
          size="md"
          decorative
        />
      }
      trailing={
        onPress ? (
          <Text variant="body" tone="muted">
            ›
          </Text>
        ) : undefined
      }
      testID={`member-row-${member.user_id}`}
    />
  );
}
