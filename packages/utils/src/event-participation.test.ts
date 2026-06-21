import { describe, it, expect } from 'vitest';
import { participationState, type PSEvent } from './event-participation';

const HOUR = 60 * 60 * 1000;
const baseEvent = (over: Partial<PSEvent> = {}): PSEvent => ({
  organizer_id: 'org',
  starts_at: new Date(100 * HOUR).toISOString(),
  num_courts: 2,
  allow_standby: false,
  standby_spots: null,
  ...over,
});
const now = 0; // far before start

describe('participationState', () => {
  it('computes regular + total capacity (no standby)', () => {
    const s = participationState(baseEvent(), [], [], 'u1', now);
    expect(s.regularCapacity).toBe(8);
    expect(s.totalCapacity).toBe(8);
    expect(s.totalIn).toBe(0);
  });

  it('adds standby spots to total capacity when allowed', () => {
    const s = participationState(
      baseEvent({ allow_standby: true, standby_spots: 3 }),
      [],
      [],
      'u1',
      now,
    );
    expect(s.totalCapacity).toBe(11);
  });

  it('counts confirmed-regular and standby separately', () => {
    const parts = [
      { user_id: 'a', status: 'confirmed', is_standby: false },
      { user_id: 'b', status: 'confirmed', is_standby: true },
      { user_id: 'c', status: 'waiting_list', is_standby: false },
    ];
    const s = participationState(baseEvent({ allow_standby: true, standby_spots: 2 }), parts, [], 'a', now);
    expect(s.confirmedRegular).toBe(1);
    expect(s.standbyUsed).toBe(1);
    expect(s.totalIn).toBe(2);
    expect(s.me?.user_id).toBe('a');
  });

  it('detects organizer and invitee', () => {
    const s1 = participationState(baseEvent(), [], [], 'org', now);
    expect(s1.isOrganizer).toBe(true);
    const s2 = participationState(baseEvent(), [], [{ invitee_id: 'u2' }], 'u2', now);
    expect(s2.isOrganizer).toBe(false);
    expect(s2.myInvite?.invitee_id).toBe('u2');
    expect(s2.me).toBeNull();
  });

  it('gates join 6h before and leave 12h before start', () => {
    const startMs = 100 * HOUR;
    const ev = baseEvent({ starts_at: new Date(startMs).toISOString() });
    const a = participationState(ev, [], [], 'u1', startMs - 13 * HOUR);
    expect(a.joinClosed).toBe(false);
    expect(a.leaveLocked).toBe(false);
    const b = participationState(ev, [], [], 'u1', startMs - 5 * HOUR);
    expect(b.joinClosed).toBe(true);
    expect(b.leaveLocked).toBe(true);
    const c = participationState(ev, [], [], 'u1', startMs - 10 * HOUR);
    expect(c.joinClosed).toBe(false);
    expect(c.leaveLocked).toBe(true);
  });
});
