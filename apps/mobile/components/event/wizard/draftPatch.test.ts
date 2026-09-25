import { describe, expect, it } from 'vitest';

import { defaultDraft, type EventDraft } from './draft';
import { applyPatch } from './draftPatch';

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
