import { useSession } from '@padel/auth';
import { ScrollView, Text } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';
import { colors } from '../../theme';

export default function ProfileTab() {
  const uid = useSession().session?.user.id;
  if (!uid) return <Text style={{ textAlign: 'center', marginTop: 48, color: colors.mutedForeground }}>—</Text>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <ProfileView userId={uid} isSelf />
    </ScrollView>
  );
}
