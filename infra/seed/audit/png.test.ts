// infra/seed/audit/png.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { solidPng } from './png.ts';

test('solidPng emits a valid PNG header and IEND', () => {
  const bytes = solidPng(8, 8, [200, 30, 60]);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(Buffer.from(bytes.subarray(bytes.length - 8, bytes.length - 4)).toString('latin1'), 'IEND');
  // IHDR width/height big-endian at offsets 16..24
  assert.equal(bytes.readUInt32BE(16), 8);
  assert.equal(bytes.readUInt32BE(20), 8);
});

test('IDAT inflates to one filter byte plus RGB per row', () => {
  const bytes = solidPng(16, 8, [10, 20, 30]);
  let offset = 8; // past the PNG signature
  let idat: Buffer | null = null;
  while (offset < bytes.length) {
    const len = bytes.readUInt32BE(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString('latin1');
    const data = bytes.subarray(offset + 8, offset + 8 + len);
    if (type === 'IDAT') idat = Buffer.from(data);
    offset += 8 + len + 4; // length + type + data + crc
  }
  assert.ok(idat, 'expected an IDAT chunk');
  const raw = inflateSync(idat!);
  assert.equal(raw.length, (16 * 3 + 1) * 8);
  for (let y = 0; y < 8; y++) {
    assert.equal(raw[y * (16 * 3 + 1)], 0);
  }
});
