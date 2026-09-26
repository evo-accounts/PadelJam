import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';
import { PARTICIPANT_PROFILE_EMBED } from './queries';

describe('participant profile embed', () => {
  // event_participants has two FKs to profiles (user_id, invited_by). An
  // unqualified `profiles(...)` embed makes PostgREST answer 300 PGRST201, which
  // threw in the queryFn and left the event detail screen showing "0 confirmed"
  // plus a Join CTA even for confirmed players and the organizer.
  it('names the user_id foreign key so PostgREST can resolve it', () => {
    expect(PARTICIPANT_PROFILE_EMBED).toContain('!event_participants_user_id_fkey');
    expect(PARTICIPANT_PROFILE_EMBED).not.toContain('invited_by');
  });

  it('leaves no unqualified profiles embed in the events queries', () => {
    // Every profiles relationship reachable from this file's tables —
    // event_participants, event_invitations, partner_requests — is ambiguous,
    // so a bare `profiles(` here is always the PGRST201 bug. Nested embeds
    // (event_teams -> event_participants, match_players -> event_participants)
    // fail the same way, which is why this checks the whole source.
    const src = readFileSync(new URL('./queries.ts', import.meta.url), 'utf8');
    const code = src.replace(/^\s*\/\/.*$/gm, ''); // prose mentions the bad form
    expect(code).not.toMatch(/\bprofiles\s*\(/);
  });

  it('embeds gender so mixed rosters can be counted', () => {
    expect(PARTICIPANT_PROFILE_EMBED).toContain('gender');
  });
});

describe('my events query keys', () => {
  it('encodes the filter in a stable array', () => {
    expect(qk.myEvents('all')).toEqual(['my-events', 'all']);
    expect(qk.myEvents('organizing')).toEqual(['my-events', 'organizing']);
    expect(qk.myEvents('going')).toEqual(['my-events', 'going']);
    expect(qk.myEvents('pending')).toEqual(['my-events', 'pending']);
  });

  it('keeps the past toggle under the same prefix, so one invalidation covers every tab', () => {
    expect(qk.myEvents('all', true)).toEqual(['my-events', 'all', 'past']);
    expect(qk.myEvents('all', true).slice(0, qk.myEventsAll.length)).toEqual([...qk.myEventsAll]);
  });
});
