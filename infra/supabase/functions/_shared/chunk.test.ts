// infra/supabase/functions/_shared/chunk.test.ts
// Run with: pnpm test:functions   (node --test; no Deno needed — the helper is pure TS)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunk } from './chunk.ts';

test('chunk splits an array into consecutive slices of at most `size`', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('chunk returns a single slice when the input fits', () => {
  assert.deepEqual(chunk(['a', 'b'], 100), [['a', 'b']]);
});

test('chunk returns no slices for an empty input', () => {
  assert.deepEqual(chunk([], 100), []);
});

test('chunk preserves order and every element exactly once at the Stream limit', () => {
  const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
  const parts = chunk(ids, 100);
  assert.deepEqual(
    parts.map((p) => p.length),
    [100, 100, 50],
  );
  assert.deepEqual(parts.flat(), ids);
});

test('chunk rejects a non-positive size instead of looping forever', () => {
  assert.throws(() => chunk([1], 0), /size/);
});
