import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Database, TypedClient } from '@padel/db';
import { mapPgError, useDb } from '../client';
import { qk } from '../query-keys';
import type { NotificationRow } from './queries';

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: qk.notifications });
  qc.invalidateQueries({ queryKey: qk.notificationsUnread });
};

export const useMarkRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useMarkAllRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useClearAll = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Delete every row the caller owns (RLS scopes this to auth.uid()).
      const { error } = await db
        .from('notifications')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

/** Notification types that carry an inline CTA. Shared by mobile and web. */
export const CTA_TYPES: ReadonlySet<string> = new Set([
  'event_invite', 'group_invite', 'community_invite', 'waitlist_spot',
]);

type Fns = Database['public']['Functions'];
type CtaFn = 'accept_event_invitation' | 'accept_group_invitation' | 'accept_invitation' | 'claim_waitlist_spot';

/** One CTA type's RPC and its exact argument shape. */
export type CtaCall = { [F in CtaFn]: { fn: F; args: Fns[F]['Args'] } }[CtaFn];

/** Which RPC a CTA notification's button calls, or null when the row carries no CTA. */
export function ctaCall(n: NotificationRow): CtaCall | null {
  // Arg names match the existing accept hooks exactly: event/group accept by
  // ENTITY id, community accepts by INVITATION id (ref_id).
  if (n.type === 'event_invite' && n.event_id) return { fn: 'accept_event_invitation', args: { p_event_id: n.event_id } };
  if (n.type === 'group_invite' && n.group_id) return { fn: 'accept_group_invitation', args: { p_group_id: n.group_id } };
  if (n.type === 'community_invite' && n.ref_id) return { fn: 'accept_invitation', args: { p_invitation_id: n.ref_id } };
  if (n.type === 'waitlist_spot' && n.event_id) return { fn: 'claim_waitlist_spot', args: { p_event_id: n.event_id } };
  return null;
}

function callCta<F extends CtaFn>(db: TypedClient, call: { fn: F; args: Fns[F]['Args'] }) {
  return db.rpc(call.fn, call.args);
}

// Acts on a CTA notification's button, then flips cta_done. A waiting-list claim that
// finds no free spot marks the row read (the offer is stale) and rethrows 'spot_taken'.
export const useCompleteNotificationCta = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NotificationRow) => {
      const call = ctaCall(n);
      if (!call) throw new Error('not_a_cta_notification');
      const { error } = await callCta(db, call);
      if (error) {
        const code = mapPgError(error) ?? 'unknown_error';
        // gender_full: the free spot is in the other half of a mixed event — this offer is stale too.
        if (code === 'spot_taken' || code === 'gender_full') {
          // Best effort: the offer is stale either way; the rethrow below carries the user-facing code.
          await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
          invalidate(qc);
        }
        throw new Error(code);
      }
      const { error: upErr } = await db
        .from('notifications')
        .update({ cta_done: true, read_at: new Date().toISOString() })
        .eq('id', n.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => invalidate(qc),
  });
};

// Accept/decline an aggregate partner/join request, routing to the per-type RPC.
// Invalidates the aggregate list + the Phase 2A pinned-count + the feed, and — for an event
// partner request, whose accept confirms a pair (UX-JEVT-12) — that event's roster.
// Errors are the stable codes of mapPgError (request_stale, event_full, event_closed, …).
export const useRespondToRequest = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: 'event' | 'community';
      requestId: string;
      action: 'accept' | 'decline';
      /** The event (or community) the request belongs to — refreshes its screens when given. */
      entityId?: string;
    }) => {
      const rpc =
        input.kind === 'event'
          ? input.action === 'accept'
            ? 'accept_partner_request'
            : 'decline_partner_request'
          : input.action === 'accept'
            ? 'accept_join_request'
            : 'decline_join_request';
      const { data, error } = await db.rpc(rpc, { p_request_id: input.requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      // accept_partner_request: 'confirmed' | 'waiting_list' (0112); the others return nothing.
      return (data ?? null) as string | null;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
      qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
      qc.invalidateQueries({ queryKey: qk.notifications });
      if (input.kind === 'event' && input.entityId) {
        // The ['event', id] prefix covers participants, teams, invitations and partner requests.
        qc.invalidateQueries({ queryKey: qk.event(input.entityId) });
        qc.invalidateQueries({ queryKey: qk.myEventsAll });
      }
    },
    onError: () => {
      // A request that vanished (withdrawn, or closed when a pair formed) should leave the list.
      qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
      qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
    },
  });
};
