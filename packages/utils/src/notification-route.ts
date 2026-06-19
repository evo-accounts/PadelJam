export type NotificationRouteInput = {
  type?: string | null;
  event_id?: string | null;
  group_id?: string | null;
  community_id?: string | null;
  actor_id?: string | null;
};

/** Map a notification (DB row or push data payload) to an in-app route, or null if none applies. */
export function notificationRoute(n: NotificationRouteInput): string | null {
  if (n.event_id) return `/event/${n.event_id}`;
  if (n.group_id) return `/group/${n.group_id}`;
  if (n.community_id) return `/community/${n.community_id}`;
  if (n.type === 'follow' && n.actor_id) return `/profile/${n.actor_id}`;
  return null;
}
