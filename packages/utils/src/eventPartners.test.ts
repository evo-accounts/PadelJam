import { describe, expect, it } from 'vitest';

import {
  filterByName,
  lookingForPartner,
  normalizeName,
  requestSections,
  sentRequestTo,
  teamPartnerOf,
  type IncomingRequest,
} from './eventPartners';

describe('filterByName', () => {
  const rows = [
    { id: 'a', full_name: 'João Silva' },
    { id: 'b', full_name: 'Maria Costa' },
    { id: 'c', full_name: null },
  ];

  it('keeps every row for an empty or blank query', () => {
    expect(filterByName(rows, '')).toHaveLength(3);
    expect(filterByName(rows, '   ')).toHaveLength(3);
  });

  it('ignores case and accents', () => {
    expect(filterByName(rows, 'joao').map((r) => r.id)).toEqual(['a']);
    expect(filterByName(rows, 'COSTA').map((r) => r.id)).toEqual(['b']);
  });

  it('never matches a row with no name', () => {
    expect(filterByName(rows, 'a').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('normalizes names', () => {
    expect(normalizeName('  Ângela ')).toBe('angela');
  });
});

describe('lookingForPartner', () => {
  it('keeps only the candidates marked interested', () => {
    const rows = [
      { id: 'a', participant_status: 'interested' },
      { id: 'b', participant_status: null },
      { id: 'c', participant_status: 'confirmed' },
    ];
    expect(lookingForPartner(rows).map((r) => r.id)).toEqual(['a']);
  });
});

describe('sentRequestTo', () => {
  const reqs = [
    { id: 'r1', requester_id: 'me', target_id: 'x', status: 'declined' },
    { id: 'r2', requester_id: 'me', target_id: 'x', status: 'pending' },
    { id: 'r3', requester_id: 'x', target_id: 'me', status: 'pending' },
  ];

  it('finds the pending request the viewer sent to that player', () => {
    expect(sentRequestTo(reqs, 'me', 'x')?.id).toBe('r2');
  });

  it('ignores requests received, and a signed-out viewer', () => {
    expect(sentRequestTo(reqs, 'x', 'me')?.id).toBe('r3');
    expect(sentRequestTo(reqs, 'me', 'nobody')).toBeNull();
    expect(sentRequestTo(reqs, undefined, 'x')).toBeNull();
  });
});

describe('teamPartnerOf', () => {
  const player = (id: string, user: string | null, name: string | null, guest: string | null = null) => ({
    id,
    user_id: user,
    guest_name: guest,
    profiles: user ? { id: user, full_name: name, avatar_url: `${user}.jpg` } : null,
  });

  it('returns the other half of the viewer\'s team', () => {
    const teams = [
      { player_a: player('p1', 'u1', 'One'), player_b: player('p2', 'u2', 'Two') },
      { player_a: player('p3', 'me', 'Me'), player_b: player('p4', 'u4', 'Four') },
    ];
    expect(teamPartnerOf(teams, 'me')).toEqual({ key: 'u4', name: 'Four', avatarPath: 'u4.jpg', guest: false });
  });

  it('works whichever slot the viewer holds, and for a guest partner', () => {
    const teams = [{ player_a: player('g', null, null, 'Rui'), player_b: player('p3', 'me', 'Me') }];
    expect(teamPartnerOf(teams, 'me')).toEqual({ key: 'g', name: 'Rui', avatarPath: null, guest: true });
  });

  it('is null when the viewer has no team or an empty slot beside them', () => {
    expect(teamPartnerOf([{ player_a: player('p1', 'u1', 'One'), player_b: null }], 'me')).toBeNull();
    expect(teamPartnerOf([{ player_a: player('p3', 'me', 'Me'), player_b: null }], 'me')).toBeNull();
    expect(teamPartnerOf([], undefined)).toBeNull();
  });
});

describe('requestSections', () => {
  const req = (id: string, kind: 'event' | 'community', entity: string, at: string): IncomingRequest => ({
    kind,
    request_id: id,
    entity_id: entity,
    entity_name: `name-${entity}`,
    created_at: at,
  });

  it('groups partner requests by event, newest event first, and keeps join requests apart at the end', () => {
    const sections = requestSections([
      req('1', 'event', 'e1', '2026-09-01'),
      req('2', 'community', 'c1', '2026-09-05'),
      req('3', 'event', 'e2', '2026-09-03'),
      req('4', 'event', 'e1', '2026-09-04'),
    ]);
    expect(sections.map((s) => (s.kind === 'event' ? s.eventId : 'community'))).toEqual(['e1', 'e2', 'community']);
    expect(sections[0]!.requests.map((r) => r.request_id)).toEqual(['4', '1']);
    expect(sections[0]!.kind === 'event' && sections[0]!.eventName).toBe('name-e1');
  });

  it('has no sections when there is nothing to answer', () => {
    expect(requestSections([])).toEqual([]);
  });
});
