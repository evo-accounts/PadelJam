import type { MyGroup } from '@padel/api';

export type CreateEventTarget = { id: string; name: string };

type CommunityRow = {
  role: string;
  community: { id: string; name: string; archived_at?: string | null } | null;
};

/**
 * The communities Home's Create Event can open the wizard in. Web's wizard lives under a
 * community (`/app/community/[id]/event-create`), so the action needs one: every live community
 * the viewer administers (an admin may create an event without a group), plus every community
 * where `useEventCreatableGroups` found a group they may create in. Sorted by name.
 */
export function createEventTargets(
  communities: readonly CommunityRow[],
  creatableGroups: readonly Pick<MyGroup, 'community_id' | 'community_name'>[],
): CreateEventTarget[] {
  const byId = new Map<string, string>();
  for (const { role, community } of communities) {
    if (community && role === 'admin' && !community.archived_at) byId.set(community.id, community.name);
  }
  for (const g of creatableGroups) if (!byId.has(g.community_id)) byId.set(g.community_id, g.community_name);
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
