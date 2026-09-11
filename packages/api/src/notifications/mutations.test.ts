import { describe, expect, it } from 'vitest';
import { ctaCall, CTA_TYPES } from './mutations';
import type { CtaCall } from './mutations';
import type { NotificationRow } from './queries';

const base: NotificationRow = {
  id: 'n1', type: 'event_invite', actor_id: null, event_id: 'e1', group_id: null, community_id: null,
  ref_id: null, actor_name: null, entity_name: null, read_at: null, cta_done: false, created_at: '2026-01-01T00:00:00Z',
};

describe('ctaCall', () => {
  it('routes each CTA type to its RPC', () => {
    expect(ctaCall(base)).toEqual({ fn: 'accept_event_invitation', args: { p_event_id: 'e1' } });
    expect(ctaCall({ ...base, type: 'group_invite', event_id: null, group_id: 'g1' }))
      .toEqual({ fn: 'accept_group_invitation', args: { p_group_id: 'g1' } });
    expect(ctaCall({ ...base, type: 'community_invite', event_id: null, ref_id: 'inv1' }))
      .toEqual({ fn: 'accept_invitation', args: { p_invitation_id: 'inv1' } });
    expect(ctaCall({ ...base, type: 'waitlist_spot' }))
      .toEqual({ fn: 'claim_waitlist_spot', args: { p_event_id: 'e1' } });
  });
  it('returns null for non-CTA rows', () => {
    expect(ctaCall({ ...base, type: 'follow' })).toBeNull();
    expect(ctaCall({ ...base, type: 'waitlist_spot', event_id: null })).toBeNull();
  });
  it('lists the CTA types once for both clients', () => {
    expect([...CTA_TYPES]).toEqual(['event_invite', 'group_invite', 'community_invite', 'waitlist_spot']);
  });
});

// Type-level guard: the CtaCall union correlates fn with its exact args, so a wrong key must not compile.
// @ts-expect-error wrong arg key for this fn
const _wrongArgs: CtaCall = { fn: 'accept_invitation', args: { p_event_id: 'x' } };
void _wrongArgs;
