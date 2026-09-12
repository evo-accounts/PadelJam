import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_OK } from './passwordOk.ts';

test('rejects a weak password missing uppercase and symbol', () => {
  assert.equal(PASSWORD_OK('padel1234'), false);
});

test('accepts a password meeting all four rules', () => {
  assert.equal(PASSWORD_OK('Padel1234#'), true);
});

test('rejects each single missing rule', () => {
  assert.equal(PASSWORD_OK('Pad1#'), false); // too short
  assert.equal(PASSWORD_OK('padel1234#'), false); // no uppercase
  assert.equal(PASSWORD_OK('Padelpadel#'), false); // no digit
  assert.equal(PASSWORD_OK('Padel12345'), false); // no symbol
});
