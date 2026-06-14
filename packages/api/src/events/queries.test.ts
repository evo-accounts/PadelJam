import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('my events query keys', () => {
  it('encodes the filter in a stable array', () => {
    expect(qk.myEvents('all')).toEqual(['my-events', 'all']);
    expect(qk.myEvents('organizing')).toEqual(['my-events', 'organizing']);
    expect(qk.myEvents('going')).toEqual(['my-events', 'going']);
  });
});
