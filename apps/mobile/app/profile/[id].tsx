import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';
import { colors } from '../../theme';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: '' }} />
      <ProfileView userId={id ?? ''} isSelf={false} />
    </ScrollView>
  );
}
