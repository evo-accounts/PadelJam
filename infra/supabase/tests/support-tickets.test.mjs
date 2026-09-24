// infra/supabase/tests/support-tickets.test.mjs
// 0106 — Contact support's field limits, enforced by the database and not just the clients.
//
// Every insert goes through PostgREST as the ticket's author, the way both apps send it, so this
// exercises the RLS insert policy and the check constraints together.
import { req, sel, user, expectError, assert, run } from './lib.mjs';

const file = (u, fields) =>
  req('/rest/v1/support_tickets', {
    method: 'POST',
    jwt: u.jwt,
    body: { user_id: u.id, ...fields },
    prefer: 'return=representation',
  });

const u = await user('support');

await run('a title of exactly 80 characters is accepted, and 81 is refused', async () => {
  const [row] = await file(u, { title: 'a'.repeat(80), description: 'ok' });
  assert(row.title.length === 80, 'the 80-character title was stored whole');

  await expectError(() => file(u, { title: 'a'.repeat(81), description: 'ok' }), 'support_tickets_title_length');
});

await run('a description of exactly 2000 characters is accepted, and 2001 is refused', async () => {
  const [row] = await file(u, { title: 'ok', description: 'b'.repeat(2000) });
  assert(row.description.length === 2000, 'the 2000-character description was stored whole');

  await expectError(
    () => file(u, { title: 'ok', description: 'b'.repeat(2001) }),
    'support_tickets_description_length',
  );
});

// The limit is characters, not bytes. "é" is two bytes in UTF-8, so an `octet_length` constraint
// would refuse this at 40 characters — which is a Portuguese title, not an edge case.
await run('the limit counts characters, not bytes', async () => {
  const accented = 'é'.repeat(80);
  const [row] = await file(u, { title: accented, description: 'ok' });
  assert(row.title === accented, 'an 80-character accented title (160 bytes) was stored whole');
});

await run('a refused insert stores nothing', async () => {
  const before = await sel('support_tickets', `user_id=eq.${u.id}&select=id`);
  await expectError(() => file(u, { title: 'c'.repeat(81), description: 'ok' }), 'support_tickets_title_length');
  const after = await sel('support_tickets', `user_id=eq.${u.id}&select=id`);
  assert(after.length === before.length, 'no row was added by the refused insert');
});
