import { useEffect } from 'react';
import { useNotificationsRealtime } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { Tabs, usePathname } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { registerForPush } from '@/lib/push';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useT('community');
  const pathname = usePathname();

  /**
   * UX-COMM-01 and UX-COMM-02: creating a community is a TASK, and a task hides
   * the navbar — leaving the tab bar up invites you to wander off mid-form and
   * lose what you typed, which is also why closing asks for confirmation.
   *
   * Driven off the pathname rather than by moving the routes out of `(tabs)`:
   * they are pushed onto the Community tab's own stack, so relocating them would
   * change every link to them and pop the user out of the tab they started in.
   */
  const inTaskFlow = /^\/community\/(create|created)\b/.test(pathname);

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
        headerShown: false,
        tabBarStyle: inTaskFlow ? { display: 'none' } : undefined,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab', { ns: 'home' }),
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
