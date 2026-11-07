import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubTransaction, stripQuery } from './sentry-scrub';

describe('stripQuery', () => {
  it('removes the whole query and fragment', () => {
    expect(stripQuery('https://x.supabase.co/rest/v1/profiles?id=eq.1&email=eq.a@b.c#h')).toBe('https://x.supabase.co/rest/v1/profiles');
    expect(stripQuery('/rest/v1/p?user_id=eq.2')).toBe('/rest/v1/p');
  });
  it('leaves a clean URL and non-strings alone', () => {
    expect(stripQuery('https://a.b/c')).toBe('https://a.b/c');
    expect(stripQuery(undefined)).toBeUndefined();
  });
});

describe('scrubBreadcrumb', () => {
  it('strips fetch and xhr urls', () => {
    for (const category of ['fetch', 'xhr']) {
      const out = scrubBreadcrumb({ category, data: { url: 'https://a.b/c?id=eq.9', method: 'GET' } });
      expect(out.data).toEqual({ url: 'https://a.b/c', method: 'GET' });
    }
  });
  it('ignores other breadcrumbs', () => {
    const b = { category: 'ui.click', data: { url: 'https://a.b/c?x=1' } };
    expect(scrubBreadcrumb(b)).toBe(b);
  });
});

describe('scrubTransaction', () => {
  it('strips description, url, http.url and drops http.query on every span', () => {
    const out = scrubTransaction({
      spans: [{
        description: 'GET https://a.b/rest/v1/p?id=eq.9',
        data: { url: 'https://a.b/p?id=eq.9', 'http.url': 'https://a.b/p?id=eq.9', 'http.query': '?id=eq.9', other: 1 },
      }, { description: 'db' }],
    });
    expect(out.spans?.[0]).toEqual({
      description: 'GET https://a.b/rest/v1/p',
      data: { url: 'https://a.b/p', 'http.url': 'https://a.b/p', other: 1 },
    });
    expect(out.spans?.[1]).toEqual({ description: 'db' });
  });
  it('passes an event without spans through', () => {
    const e = {};
    expect(scrubTransaction(e)).toBe(e);
  });
});
