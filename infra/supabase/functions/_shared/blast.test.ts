import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasEmailChannel, nextEmailAttempt, renderBlastEmailHtml } from './blast.ts';

test('only a blast with the email channel is delivered', () => {
  assert.equal(hasEmailChannel(['email']), true);
  assert.equal(hasEmailChannel(['whatsapp', 'email']), true);
  // WhatsApp-only: shared from the organizer's device, nothing for the function to send.
  assert.equal(hasEmailChannel(['whatsapp']), false);
  assert.equal(hasEmailChannel([]), false);
  assert.equal(hasEmailChannel(null), false);
  assert.equal(hasEmailChannel(undefined), false);
});

test("the first email attempt is 1 even when the RPC already logged a WhatsApp 'shared' row", () => {
  assert.equal(nextEmailAttempt([]), 1);
  assert.equal(nextEmailAttempt(null), 1);
  assert.equal(nextEmailAttempt([{ channel: 'whatsapp', attempt: 1 }]), 1);
});

test('a retry follows the latest EMAIL attempt, ignoring other channels and row order', () => {
  assert.equal(
    nextEmailAttempt([
      { channel: 'email', attempt: 1 },
      { channel: 'whatsapp', attempt: 7 },
      { channel: 'email', attempt: 2 },
    ]),
    3,
  );
});

test('organizer text is escaped and newlines become line breaks', () => {
  assert.equal(
    renderBlastEmailHtml('A < B & C', 'line 1\n<b>line 2</b>'),
    '<h2>A &lt; B &amp; C</h2><p>line 1<br>&lt;b&gt;line 2&lt;/b&gt;</p>',
  );
});
