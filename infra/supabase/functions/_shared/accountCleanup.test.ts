// Run with: pnpm test:functions
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUpDeletedAccount, type AvatarStorage, type StreamUsers } from './accountCleanup.ts';

const fakeStorage = (names: string[], opts: { failList?: boolean } = {}) => {
  const files = [...names];
  const removed: string[] = [];
  const storage: AvatarStorage = {
    async list(_p, { limit, offset }) {
      if (opts.failList) return { data: null, error: { message: 'boom' } };
      return { data: files.slice(offset, offset + limit).map((name) => ({ name })), error: null };
    },
    async remove(paths) {
      for (const p of paths) {
        removed.push(p);
        files.splice(files.indexOf(p.split('/')[1]), 1);
      }
      return { error: null };
    },
  };
  return { storage, removed };
};
const okStream = () => {
  const calls: unknown[] = [];
  const stream: StreamUsers = { async revokeUserToken(u) { calls.push({ revoke: u }); }, async partialUpdateUser(u) { calls.push(u); } };
  return { stream, calls };
};

test('removes every avatar file across more than one page', async () => {
  const names = Array.from({ length: 250 }, (_, i) => `a${i}.jpg`);
  const { storage, removed } = fakeStorage(names);
  await cleanUpDeletedAccount('u1', { storage, stream: okStream().stream }, () => {});
  assert.equal(removed.length, 250);
  assert.ok(removed.every((p) => p.startsWith('u1/')));
});

test('a storage failure still runs the Stream step and does not throw', async () => {
  const { storage } = fakeStorage([], { failList: true });
  const { stream, calls } = okStream();
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream }, (m) => logs.push(m));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { revoke: 'u1' });
  assert.deepEqual(calls[1], { id: 'u1', set: { name: 'Deleted user' }, unset: ['image'] });
  assert.ok(logs.some((l) => l.includes('u1') && l.includes('avatar')));
});

test('a Stream failure is logged, not thrown', async () => {
  const { storage } = fakeStorage(['a.jpg']);
  const stream: StreamUsers = { async revokeUserToken() {}, async partialUpdateUser() { throw new Error('stream down'); } };
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream }, (m) => logs.push(m));
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes('u1') && logs[0].includes('Stream'));
});

test('an unknown Stream user counts as done', async () => {
  const { storage } = fakeStorage([]);
  const stream: StreamUsers = { async revokeUserToken() {}, async partialUpdateUser() { throw Object.assign(new Error("user doesn't exist"), { code: 16 }); } };
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream }, (m) => logs.push(m));
  assert.deepEqual(logs, []);
});

test('missing Stream keys are logged and storage still cleaned', async () => {
  const { storage, removed } = fakeStorage(['a.jpg']);
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream: null }, (m) => logs.push(m));
  assert.equal(removed.length, 1);
  assert.equal(logs.length, 1);
});

test('a failed token revoke is logged and the anonymise still runs', async () => {
  const { storage } = fakeStorage([]);
  const calls: unknown[] = [];
  const stream: StreamUsers = {
    async revokeUserToken() { throw new Error('revoke down'); },
    async partialUpdateUser(u) { calls.push(u); },
  };
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream }, (m) => logs.push(m));
  assert.equal(calls.length, 1);
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes('u1') && logs[0].includes('revoke'));
});

test('notifications naming the account are renamed to Deleted user', async () => {
  const { storage } = fakeStorage([]);
  const seen: unknown[] = [];
  const notifications = { async renameActor(uid: string, name: string) { seen.push([uid, name]); return null; } };
  await cleanUpDeletedAccount('u1', { storage, stream: okStream().stream, notifications }, () => {});
  assert.deepEqual(seen, [['u1', 'Deleted user']]);
});

test('a notifications failure is logged without the error, and Stream still runs', async () => {
  const { storage } = fakeStorage([]);
  const { stream, calls } = okStream();
  const notifications = { async renameActor() { return { message: 'secret db detail' }; } };
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream, notifications }, (m) => logs.push(m));
  assert.equal(calls.length, 2);
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes('u1') && logs[0].includes('notification'));
});

test('activity rows naming the account are renamed to Deleted user', async () => {
  const { storage } = fakeStorage([]);
  const seen: unknown[] = [];
  const activity = { async renameSelfNamed(uid: string, name: string) { seen.push([uid, name]); return null; } };
  await cleanUpDeletedAccount('u1', { storage, stream: okStream().stream, activity }, () => {});
  assert.deepEqual(seen, [['u1', 'Deleted user']]);
});

test('an activity failure is logged without the error, and later steps still run', async () => {
  const { storage } = fakeStorage([]);
  const { stream, calls } = okStream();
  const activity = { async renameSelfNamed(): Promise<{ message: string }> { throw new Error('secret db detail'); } };
  const logs: string[] = [];
  await cleanUpDeletedAccount('u1', { storage, stream, activity }, (m) => logs.push(m));
  assert.equal(calls.length, 2);
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes('u1') && logs[0].includes('activity'));
});
