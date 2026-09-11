// infra/seed/audit/png.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solidPng } from './png.ts';

test('solidPng emits a valid PNG header and IEND', () => {
  const bytes = solidPng(8, 8, [200, 30, 60]);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(Buffer.from(bytes.subarray(bytes.length - 8, bytes.length - 4)).toString('latin1'), 'IEND');
  // IHDR width/height big-endian at offsets 16..24
  assert.equal(bytes.readUInt32BE(16), 8);
  assert.equal(bytes.readUInt32BE(20), 8);
});
