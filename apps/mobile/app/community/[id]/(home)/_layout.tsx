import { useCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityHero } from '@/components/community/CommunityHero';
import { CommunityIdProvider } from '@/components/community/CommunityIdContext';
import { colors, palette } from '../../../../theme';

/**
 * Persistent community hero above Expo Router's SDK-56 Material Top Tabs
 * (`expo-router/js-top-tabs`). This replaces the standalone
 * `@react-navigation/material-top-tabs` navigator, which SDK 56 blocks from being
 * imported directly; the vendored TopTabs is Expo-Go-safe and needs no extra deps.
 *
 * This layout is also where the community id is resolved for the whole tab set: a
 * tab navigator only gives its anchor route the params from the matched path, so
 * the tabs cannot read `id` themselves. See CommunityIdContext.
 */
export default function CommunityHomeLayout() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isError } = useCommunity(id);

  // `id` is always present on this route, but guard rather than hand `undefined`
  // to the provider: a missing id must surface as "not found", never as tabs that
  // quietly query `community_id=eq.undefined`.
  if (isError || !id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>{t('notFoundTitle')}</Text>
          <Text style={styles.notFoundBody}>{t('notFoundBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CommunityHero communityId={id} />
      <CommunityIdProvider id={id}>
        <TopTabs
          screenOptions={{
            tabBarScrollEnabled: true,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: palette.slate[400],
            tabBarIndicatorStyle: { backgroundColor: colors.primary },
            tabBarLabelStyle: { fontSize: 13, fontWeight: '700', textTransform: 'none' },
            tabBarItemStyle: { width: 'auto', paddingHorizontal: 16 },
          }}
        >
          <TopTabs.Screen name="posts" options={{ title: t('tabPosts') }} />
          <TopTabs.Screen name="events" options={{ title: t('tabEvents') }} />
          <TopTabs.Screen name="groups" options={{ title: t('tabGroups') }} />
          <TopTabs.Screen name="members" options={{ title: t('tabMembers') }} />
          <TopTabs.Screen name="about" options={{ title: t('tabAbout') }} />
        </TopTabs>
      </CommunityIdProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  notFoundTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  notFoundBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', lineHeight: 21 },
});
