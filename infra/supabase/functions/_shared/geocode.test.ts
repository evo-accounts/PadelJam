import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BoundedCache,
  buildSearchUrl,
  cacheKey,
  createThrottle,
  mapRows,
  normalizeLang,
  normalizeQuery,
  shortLabel,
} from './geocode.ts';

test('normalizeQuery trims, collapses whitespace and enforces 3–200 chars', () => {
  assert.equal(normalizeQuery('  Rua   Augusta \n 1 '), 'Rua Augusta 1');
  assert.equal(normalizeQuery('ab'), null);
  assert.equal(normalizeQuery('   a b  '), 'a b');
  assert.equal(normalizeQuery('x'.repeat(200)), 'x'.repeat(200));
  assert.equal(normalizeQuery('x'.repeat(201)), null);
  assert.equal(normalizeQuery(42), null);
  assert.equal(normalizeQuery(undefined), null);
});

test('normalizeLang keeps locale tags and falls back to en', () => {
  assert.equal(normalizeLang('pt-PT'), 'pt-PT');
  assert.equal(normalizeLang('pt-BR'), 'pt-BR');
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang(undefined), 'en');
  assert.equal(normalizeLang('en&q=evil'), 'en');
  assert.equal(normalizeLang(''), 'en');
});

test('buildSearchUrl asks Nominatim for 5 jsonv2 rows in the given language', () => {
  const url = new URL(buildSearchUrl('Rua Augusta & 1, Lisboa', 'pt-PT'));
  assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('q'), 'Rua Augusta & 1, Lisboa');
  assert.equal(url.searchParams.get('accept-language'), 'pt-PT');
});

test('mapRows parses coordinates and drops unusable rows', () => {
  const rows = [
    { display_name: 'Lisboa, Portugal', lat: '38.7077507', lon: '-9.1365919' },
    { display_name: 'No coords', lat: 'abc', lon: '1' },
    { display_name: '', lat: '1', lon: '1' },
    { display_name: 'Out of range', lat: '91', lon: '0' },
    null,
    { display_name: 'Porto, Portugal', lat: 41.15, lon: -8.61 },
  ];
  assert.deepEqual(mapRows(rows), [
    { label: 'Lisboa, Portugal', lat: 38.7077507, lng: -9.1365919 },
    { label: 'Porto, Portugal', lat: 41.15, lng: -8.61 },
  ]);
  assert.deepEqual(mapRows({ error: 'x' }), []);
});

test('shortLabel keeps the first three comma-separated parts', () => {
  assert.equal(
    shortLabel('Clube de Padel, Rua Augusta, Baixa, Lisboa, 1100-048, Portugal'),
    'Clube de Padel, Rua Augusta, Baixa',
  );
  assert.equal(shortLabel('Lisboa, Portugal'), 'Lisboa, Portugal');
  assert.equal(shortLabel(' A ,, B , C, D'), 'A, B, C');
});

test('cacheKey is language-scoped and case-insensitive', () => {
  assert.equal(cacheKey('Lisboa', 'pt-PT'), cacheKey('lisboa', 'pt-PT'));
  assert.notEqual(cacheKey('Lisboa', 'pt-PT'), cacheKey('Lisboa', 'en'));
});

test('BoundedCache drops the oldest entry past its cap', () => {
  const c = new BoundedCache<number>(2);
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  assert.equal(c.size, 2);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.get('b'), 2);
  assert.equal(c.get('c'), 3);
  // Re-setting refreshes the entry's age.
  c.set('b', 20);
  c.set('d', 4);
  assert.equal(c.get('c'), undefined);
  assert.equal(c.get('b'), 20);
});

test('createThrottle spaces call starts by the gap, even after a failure', async () => {
  let clock = 0;
  const starts: number[] = [];
  const throttled = createThrottle(
    1100,
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  const call = (fail = false) =>
    throttled(async () => {
      starts.push(clock);
      clock += 10; // the request itself
      if (fail) throw new Error('boom');
      return clock;
    });
  const results = await Promise.allSettled([call(), call(true), call()]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['fulfilled', 'rejected', 'fulfilled'],
  );
  assert.deepEqual(starts, [0, 1100, 2200]);
});
