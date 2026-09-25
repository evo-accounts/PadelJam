import { useLocalSearchParams } from 'expo-router';

import { GroupCreateScreen } from '@/components/group/GroupCreateScreen';

/** Create Group from inside a community (its Groups tab, Manage Groups): no community to pick. */
export default function GroupCreateModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupCreateScreen communityId={id} />;
}
