// infra/seed/audit/cast.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A1, A2, NAMED, CROWD, SUPPORTING, ALL_EMAILS, byKey } from './cast.ts';

test('cast shape matches the audit document', () => {
  assert.equal(A1.email, 'user@padeljam.com');
  assert.equal(A2.email, 'newuser@padeljam.com');
  assert.equal(NAMED.length, 17);
  assert.equal(NAMED.filter((p) => p.gender === 'female').length, 8);
  assert.equal(NAMED.filter((p) => !p.avatar).length, 3);
  assert.equal(CROWD.length, 13);
  assert.equal(SUPPORTING.length, 30);
  assert.equal(new Set(ALL_EMAILS).size, ALL_EMAILS.length);
  assert.equal(new Set(SUPPORTING.map((p) => p.phone)).size, SUPPORTING.length);
  assert.equal(byKey('u3').name, 'Q');
  assert.ok(byKey('u2').name.length >= 50);
});
