import { useLocalSearchParams } from 'expo-router';

import { FollowList } from '@/components/profile/FollowList';

export default function FollowingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FollowList userId={id ?? ''} kind="following" />;
}
