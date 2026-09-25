import { describe, expect, it } from 'vitest';

import { qk } from '../query-keys';
import { type MyGroup, pickEventCreatableGroups } from './queries';

const g = (group_id: string, community_id: string): MyGroup => ({
  group_id,
  name: group_id,
  community_id,
  community_name: community_id,
  member_count: 4,
  is_managing: false,
  description: null,
  thumbnail_path: null,
  is_private: false,
  archived_at: null,
});

describe('pickEventCreatableGroups (UX-CEVT-02, B14)', () => {
  const groups = [g('a1', 'A'), g('a2', 'A'), g('b1', 'B'), g('c1', 'C')];

  it('keeps only groups in communities where you may create events', () => {
    expect(pickEventCreatableGroups(groups, new Set(['A', 'C'])).map((x) => x.group_id)).toEqual([
      'a1',
      'a2',
      'c1',
    ]);
  });

  it('narrows to the community the wizard was opened from', () => {
    expect(pickEventCreatableGroups(groups, new Set(['A', 'C']), 'C').map((x) => x.group_id)).toEqual([
      'c1',
    ]);
    expect(pickEventCreatableGroups(groups, new Set(['A']), 'B')).toEqual([]);
  });

  it('lists nothing when you may create events nowhere', () => {
    expect(pickEventCreatableGroups(groups, new Set())).toEqual([]);
  });

  it('keys under the my-groups prefix so a my-groups invalidation refreshes it', () => {
    expect(qk.eventCreatableGroups('A').slice(0, 1)).toEqual(qk.myGroups);
  });
});
