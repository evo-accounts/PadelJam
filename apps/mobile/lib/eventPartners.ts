/**
 * Pure helpers behind the team-event screens (UX-JEVT-10..12): filtering the partner candidates,
 * finding the viewer's partner for the "You are going" screen, and grouping the Partner Requests
 * inbox by event. No React, so every rule is unit-tested.
 */

/** Case- and accent-insensitive: "joao" finds "João". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Rows whose name contains the query (UX-GLOB-05). An empty query keeps every row. */
export function filterByName<T extends { full_name: string | null }>(rows: readonly T[], query: string): T[] {
  const q = normalizeName(query);
  if (q === '') return [...rows];
  return rows.filter((r) => r.full_name != null && normalizeName(r.full_name).includes(q));
}

/**
 * "I need a partner" (UX-JEVT-11) lists only the other players who are also looking — the
 * candidates marked interested. `event_partner_candidates` (0112) already drops the caller,
 * blocked users and anyone paired or waiting.
 */
export function lookingForPartner<T extends { participant_status: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.participant_status === 'interested');
}

/** The pending request the viewer sent to `targetId` on this event, if any. */
export function sentRequestTo<T extends { id: string; requester_id: string; target_id: string; status: string }>(
  requests: readonly T[],
  uid: string | undefined,
  targetId: string,
): T | null {
  if (!uid) return null;
  return requests.find((r) => r.requester_id === uid && r.target_id === targetId && r.status === 'pending') ?? null;
}

type TeamPlayer = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
} | null;

export type PartnerLite = {
  /** Profile id, or the participant id for a guest (colour key only). */
  key: string;
  name: string | null;
  avatarPath: string | null;
  guest: boolean;
};

/** The other half of the viewer's team, for the "You are going" screen (UX-JEVT-10). */
export function teamPartnerOf(
  teams: readonly { player_a: TeamPlayer; player_b: TeamPlayer }[],
  uid: string | undefined,
): PartnerLite | null {
  if (!uid) return null;
  for (const t of teams) {
    const other =
      t.player_a?.user_id === uid ? t.player_b : t.player_b?.user_id === uid ? t.player_a : undefined;
    if (other === undefined) continue;
    if (other == null) return null;
    return {
      key: other.profiles?.id ?? other.id,
      name: other.profiles?.full_name ?? other.guest_name,
      avatarPath: other.profiles?.avatar_url ?? null,
      guest: other.user_id == null,
    };
  }
  return null;
}

export type IncomingRequest = {
  kind: 'event' | 'community';
  request_id: string;
  entity_id: string;
  entity_name: string;
  created_at: string;
};

export type RequestSection<T extends IncomingRequest> =
  | { kind: 'event'; eventId: string; eventName: string; requests: T[] }
  | { kind: 'community'; requests: T[] };

/**
 * UX-JEVT-12: partner requests grouped by event (the newest request decides an event's place),
 * then — kept apart, since they are not partner invitations — community join requests an admin
 * receives through the same inbox (`incoming_partner_requests`, 0098).
 */
export function requestSections<T extends IncomingRequest>(rows: readonly T[]): RequestSection<T>[] {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const events = new Map<string, { kind: 'event'; eventId: string; eventName: string; requests: T[] }>();
  const community: T[] = [];
  for (const r of sorted) {
    if (r.kind === 'community') {
      community.push(r);
      continue;
    }
    let section = events.get(r.entity_id);
    if (!section) {
      section = { kind: 'event', eventId: r.entity_id, eventName: r.entity_name, requests: [] };
      events.set(r.entity_id, section);
    }
    section.requests.push(r);
  }
  const out: RequestSection<T>[] = [...events.values()];
  if (community.length > 0) out.push({ kind: 'community', requests: community });
  return out;
}
