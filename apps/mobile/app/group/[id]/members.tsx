import { useLocalSearchParams } from 'expo-router';

import { GroupMembersList } from '@/components/group/GroupMembersList';

/** Members (UX-GRP-07) — the same component as Manage members (UX-GRP-12). */
export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupMembersList groupId={id} />;
}
