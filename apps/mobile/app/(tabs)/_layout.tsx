import { useEffect } from 'react';
import { useNotificationsRealtime } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import Colors from '@/constants/Colors';
import { ChatHeaderButton } from '@/components/chat/ChatHeaderButton';
import { NotificationBell } from '@/components/NotificationBell';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { registerForPush } from '@/lib/push';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useT('community');

  useNotificationsRealtime();

  // (tabs) only mounts for an authenticated user. Registering here (not just in
  // the cold-start Boot path) covers fresh sign-ins within a running app.
  // registerForPush is idempotent and never throws.
  useEffect(() => {
    void registerForPush();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab', { ns: 'home' }),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 12 }}>
              {/* No search action here: search lives at the top of Explore,
                  which is its own tab. A magnifying glass in the header that
                  only jumps to that tab was a second front door to one room. */}
              <ChatHeaderButton />
              <NotificationBell />
            </View>
          ),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('tab', { ns: 'events' }),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tab', { ns: 'discovery' }),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'safari', android: 'explore', web: 'explore' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tab'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab', { ns: 'profile' }),
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
