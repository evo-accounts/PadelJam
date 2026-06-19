import { describe, it, expect } from 'vitest';
import { extractImageUrls, appendImages, nextCursor, pageHasMore, type MsgLike } from './chat-media';

const img = (id: string, ...urls: string[]): MsgLike => ({
  id, attachments: urls.map((u) => ({ type: 'image', image_url: u })),
});

describe('extractImageUrls', () => {
  it('returns image urls newest-first from an ascending page', () => {
    // ascending: m1 (oldest) → m3 (newest)
    expect(extractImageUrls([img('m1', 'a'), img('m2', 'b'), img('m3', 'c')])).toEqual(['c', 'b', 'a']);
  });
  it('falls back to asset_url when image_url is absent', () => {
    expect(extractImageUrls([{ id: 'm', attachments: [{ type: 'image', asset_url: 'z' }] }])).toEqual(['z']);
  });
  it('skips non-image attachments and messages without attachments', () => {
    expect(extractImageUrls([
      { id: 'm1', attachments: [{ type: 'file', asset_url: 'f' }] },
      { id: 'm2', text: 'hi' },
      img('m3', 'ok'),
    ])).toEqual(['ok']);
  });
  it('handles an empty page', () => {
    expect(extractImageUrls([])).toEqual([]);
  });
});

describe('appendImages', () => {
  it('appends a new page after existing', () => {
    expect(appendImages(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('de-duplicates overlap and within-page repeats, preserving order', () => {
    expect(appendImages(['a', 'b'], ['b', 'c', 'c', 'a'])).toEqual(['a', 'b', 'c']);
  });
});

describe('nextCursor', () => {
  it('returns the oldest (first) message id', () => {
    expect(nextCursor([{ id: 'old' }, { id: 'new' }])).toBe('old');
  });
  it('returns undefined for an empty page', () => {
    expect(nextCursor([])).toBeUndefined();
  });
});

describe('pageHasMore', () => {
  it('is true when the page is full', () => {
    expect(pageHasMore([{ id: '1' }, { id: '2' }], 2)).toBe(true);
  });
  it('is false when the page is short', () => {
    expect(pageHasMore([{ id: '1' }], 2)).toBe(false);
  });
});
