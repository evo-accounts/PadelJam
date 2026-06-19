import { useSession } from '@padel/auth';
import { notificationRoute } from '@padel/utils';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

/** Deep-link a tapped/cold-start push to its target screen, only when authenticated. */
export function usePushTapRouting(): void {
  const router = useRouter();
  const { session } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const coldHandled = useRef(false);

  const go = (response: Notifications.NotificationResponse | null) => {
    if (!response || !sessionRef.current) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const route = notificationRoute({
      type: str(data.type),
      event_id: str(data.event_id),
      group_id: str(data.group_id),
      community_id: str(data.community_id),
      actor_id: str(data.actor_id),
    });
    if (route) router.push(route as Href);
  };

  // Live taps (foreground/background).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold-start tap — handle once, after the session resolves.
  useEffect(() => {
    if (coldHandled.current || !session) return;
    coldHandled.current = true;
    Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
}
