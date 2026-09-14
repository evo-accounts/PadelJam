import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfileRow } from './profileRow.ts';

const AT = new Date('2026-09-14T10:11:12.000Z');
const base = { id: 'u1', authEmail: 'a@b.test', authPhone: '351911111111', fullName: 'Ana Silva', acceptedAt: AT };

test('records the consent timestamp — the whole point of calling this from complete-account', () => {
  assert.equal(buildProfileRow(base).terms_accepted_at, '2026-09-14T10:11:12.000Z');
});

test("GoTrue's empty-string identifiers become NULL, not ''", () => {
  // Two users who both skip the secondary would otherwise collide on the UNIQUE constraint.
  const row = buildProfileRow({ ...base, authEmail: '', authPhone: '' });
  assert.equal(row.email, null);
  assert.equal(row.phone, null);
});

test('a missing identifier is NULL whether it arrives as null or undefined', () => {
  assert.equal(buildProfileRow({ ...base, authPhone: null }).phone, null);
  assert.equal(buildProfileRow({ ...base, authPhone: undefined }).phone, null);
});

test('present identifiers are passed through untouched', () => {
  const row = buildProfileRow(base);
  assert.equal(row.email, 'a@b.test');
  assert.equal(row.phone, '351911111111'); // no '+' — GoTrue's format, and profiles copies it
});

test('the display name is trimmed and its inner whitespace collapsed', () => {
  assert.equal(buildProfileRow({ ...base, fullName: '  Ana   Maria  Silva ' }).full_name, 'Ana Maria Silva');
});
