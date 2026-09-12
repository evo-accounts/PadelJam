import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/ProfileView';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function PlayerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <TopBar onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }}>
        <ProfileView userId={id ?? ''} isSelf={false} />
      </ScrollView>
    </SafeAreaView>
  );
}
