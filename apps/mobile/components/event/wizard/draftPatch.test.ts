import { describe, expect, it } from 'vitest';

import { defaultDraft, type EventDraft } from './draft';
import { applyPatch, onEnterStep } from './draftPatch';

const inGroup: EventDraft = { ...defaultDraft, groupId: 'g1', groupCommunityId: 'c1', isPrivate: true };

describe('applyPatch', () => {
  it('makes a standalone event private and forgets the group community', () => {
    const d = applyPatch(inGroup, { groupId: null });
    expect(d.isPrivate).toBe(true);
    expect(d.groupCommunityId).toBeUndefined();
  });

  it('starts a newly picked group public', () => {
    expect(applyPatch(inGroup, { groupId: 'g2', groupCommunityId: 'c2' }).isPrivate).toBe(false);
  });

  it('keeps privacy when the same group is picked again', () => {
    expect(applyPatch(inGroup, { groupId: 'g1', groupCommunityId: 'c1' }).isPrivate).toBe(true);
  });

  it('leaves privacy alone for unrelated patches', () => {
    expect(applyPatch(inGroup, { name: 'x' }).isPrivate).toBe(true);
  });
});

describe('onEnterStep', () => {
  const now = new Date(2026, 9, 3, 15, 12).getTime();

  it('gives the Date step a start before it renders: the first slot an hour or more out', () => {
    const d = onEnterStep(defaultDraft, 'date', now);
    const start = new Date(d.startsAt!);
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([3, 16, 30]);
  });

  it('keeps a start already chosen, and leaves other steps alone', () => {
    const chosen = { ...defaultDraft, startsAt: '2026-10-10T18:00:00.000Z' };
    expect(onEnterStep(chosen, 'date', now)).toBe(chosen);
    expect(onEnterStep(defaultDraft, 'courts', now)).toBe(defaultDraft);
  });
});
