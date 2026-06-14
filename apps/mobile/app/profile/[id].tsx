import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <Stack.Screen options={{ title: '' }} />
      <ProfileView userId={id ?? ''} isSelf={false} />
    </ScrollView>
  );
}
