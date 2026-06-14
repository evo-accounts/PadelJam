import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('profile query keys', () => {
  it('shapes', () => {
    expect(qk.profile('u1')).toEqual(['profile', 'u1']);
    expect(qk.following('u1')).toEqual(['profile', 'u1', 'following']);
    expect(qk.followers('u1')).toEqual(['profile', 'u1', 'followers']);
  });
  it('myProfile key shape', () => {
    expect(qk.myProfile('u1')).toEqual(['profile', 'u1', 'edit']);
  });
});
