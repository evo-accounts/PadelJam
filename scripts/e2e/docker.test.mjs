import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDocker } from './docker.mjs';

const harness = (upAfter) => {
  const calls = { checks: 0, starts: 0, sleeps: 0 };
  return {
    calls,
    isUp: () => ++calls.checks >= upAfter,
    start: () => { calls.starts++; },
    sleep: async () => { calls.sleeps++; },
  };
};

test('up at once: no start, no sleep', async () => {
  const h = harness(1);
  assert.equal(await ensureDocker(h), true);
  assert.equal(h.calls.starts, 0);
  assert.equal(h.calls.sleeps, 0);
});

test('down, then up on the third check: starts once', async () => {
  const h = harness(3);
  assert.equal(await ensureDocker(h), true);
  assert.equal(h.calls.starts, 1);
});

test('never up: false after exactly `attempts` sleeps, starts once', async () => {
  const h = harness(Infinity);
  assert.equal(await ensureDocker({ ...h, attempts: 4 }), false);
  assert.equal(h.calls.sleeps, 4);
  assert.equal(h.calls.starts, 1);
});
