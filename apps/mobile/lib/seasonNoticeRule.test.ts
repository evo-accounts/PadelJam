import { describe, expect, it } from 'vitest';

import { seasonToAnnounce } from './seasonNoticeRule';

describe('seasonToAnnounce', () => {
  it('announces nothing while no season has closed', () => {
    expect(seasonToAnnounce(null, 2)).toBeNull();
  });
  it('stays quiet on a first visit, so a new member is not greeted with old news', () => {
    expect(seasonToAnnounce(3, null)).toBeNull();
  });
  it('announces a season closed since the last visit', () => {
    expect(seasonToAnnounce(3, 2)).toBe(3);
  });
  it('does not repeat a season already seen', () => {
    expect(seasonToAnnounce(3, 3)).toBeNull();
  });
});
