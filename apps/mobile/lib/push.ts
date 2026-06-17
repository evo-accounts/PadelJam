import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Foreground display behaviour.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register this device's Expo push token with the backend. No-ops off-device / without permission / projectId. */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators can't receive remote push
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return; // not EAS-initialised yet

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await supabase.rpc('register_push_token', { p_expo_token: token, p_platform: platform });
  } catch {
    /* push is best-effort; never block app start */
  }
}

/** Remove this device's token (sign-out / rotation). */
export async function unregisterForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('push_tokens').delete().eq('expo_token', token);
  } catch {
    /* best-effort */
  }
}
