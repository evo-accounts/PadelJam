import { useSession } from '@padel/auth';
import { ScrollView, Text } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';

export default function ProfileTab() {
  const uid = useSession().session?.user.id;
  if (!uid) return <Text style={{ textAlign: 'center', marginTop: 48, color: '#6B7685' }}>—</Text>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <ProfileView userId={uid} isSelf />
    </ScrollView>
  );
}
