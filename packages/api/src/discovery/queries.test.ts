import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('explore query keys', () => {
  it('rail keys are stable arrays', () => {
    expect(qk.exploreCommunities).toEqual(['explore', 'communities']);
    expect(qk.exploreGroups).toEqual(['explore', 'groups']);
    expect(qk.exploreEvents).toEqual(['explore', 'events']);
    expect(qk.explorePlayers).toEqual(['explore', 'players']);
  });
  it('see-all keys extend rail keys with "list"', () => {
    expect(qk.exploreCommunitiesList).toEqual(['explore', 'communities', 'list']);
    expect(qk.exploreEventsList).toEqual(['explore', 'events', 'list']);
    expect(qk.exploreGroupsList).toEqual(['explore', 'groups', 'list']);
    expect(qk.explorePlayersList).toEqual(['explore', 'players', 'list']);
  });
});
