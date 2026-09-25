import { useLocalSearchParams } from 'expo-router';

import { GroupMembersList } from '@/components/group/GroupMembersList';

/**
 * Manage members (UX-GRP-12): the Members screen reached from Manage Group. It is the same
 * component, not a second screen with its own inline "Remover do grupo" — an admin's tap opens the
 * member actions sheet there, and a swipe exposes the same removal.
 */
export default function GroupManageMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupMembersList groupId={id} />;
}
