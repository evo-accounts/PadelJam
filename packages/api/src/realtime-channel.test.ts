import { describe, it, expect } from 'vitest';
import { uniqueChannelTopic } from './realtime-channel';

describe('uniqueChannelTopic', () => {
  it('never returns the same topic twice for the same base', () => {
    // client.channel(topic) silently returns the existing (possibly still
    // subscribed) channel on a topic collision, and adding postgres_changes
    // callbacks to it throws — so remounting a hook with a colliding topic
    // (e.g. logout → login as another user in the same session) crashed the
    // app. Uniqueness per call is the invariant that prevents that.
    const a = uniqueChannelTopic('notifications:user-1');
    const b = uniqueChannelTopic('notifications:user-1');
    expect(a).not.toBe(b);
  });

  it('keeps the base as a readable prefix', () => {
    expect(uniqueChannelTopic('feed:c1')).toMatch(/^feed:c1#\d+$/);
  });

  it('stays unique across different bases too', () => {
    const seen = new Set(
      ['event:e1', 'event:e1', 'group:g1', 'group:g1'].map(uniqueChannelTopic),
    );
    expect(seen.size).toBe(4);
  });
});
