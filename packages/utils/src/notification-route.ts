export type NotificationRouteInput = {
  type?: string | null;
  event_id?: string | null;
  group_id?: string | null;
  community_id?: string | null;
  actor_id?: string | null;
};

/** Map a notification (DB row or push data payload) to an in-app route, or null if none applies. */
export function notificationRoute(n: NotificationRouteInput): string | null {
  // A partner request is answered on the Partner Requests screen, not on the event (0113).
  if (n.type === 'partner_request') return '/notifications/partner-requests';
  if (n.event_id) return `/event/${n.event_id}`;
  // A group invitation opens its invitation screen (UX-GRP-02): for a private group the group
  // page itself is invisible until you accept, so only the invitation can show what it is.
  if (n.type === 'group_invite' && n.group_id) return `/group/${n.group_id}/join`;
  if (n.group_id) return `/group/${n.group_id}`;
  if (n.community_id) return `/community/${n.community_id}`;
  if (n.type === 'follow' && n.actor_id) return `/profile/${n.actor_id}`;
  return null;
}
