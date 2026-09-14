// infra/supabase/tests/complete-account-consent.test.mjs
// The consent record. profiles.terms_accepted_at used to be written in exactly ONE place —
// provision-social-profile, for social users who never tick a box — while complete-account, the
// function behind the screen where a user DOES tick a gated checkbox, never wrote it at all. The
// only accounts carrying a consent timestamp were the only ones that never affirmatively consented.
//
// Everything here goes through the Edge Function rather than SQL, because the write lives there
// and a SQL-level test would assert nothing about the defect.
//
// SERVING THE FUNCTION: by default this hits the local stack's gateway, which serves whatever
// checkout `supabase start` was run from. When you are working in a git worktree that is a
// DIFFERENT checkout, point COMPLETE_ACCOUNT_URL at a copy you are serving yourself, e.g.
//   docker run --rm -p 8099:8000 -v "$PWD/infra/supabase/functions:/fn" \
//     -e SUPABASE_URL=http://host.docker.internal:55321 -e SUPABASE_ANON_KEY=... \
//     -e SUPABASE_SERVICE_ROLE_KEY=... denoland/deno:latest deno run --allow-all \
//     /fn/complete-account/index.ts
//   COMPLETE_ACCOUNT_URL=http://127.0.0.1:8099 node infra/supabase/tests/complete-account-consent.test.mjs
import { BASE_URL, req, sel, signIn, assert, run } from './lib.mjs';

const RUN = process.env.TEST_RUN || Date.now().toString(36);
const FN_URL = process.env.COMPLETE_ACCOUNT_URL || `${BASE_URL}/functions/v1/complete-account`;
const PASSWORD = 'Padel1234#';

const complete = (jwt, body) =>
  fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });

/** An account mid-signup: a verified email on auth.users and NO profiles row yet. */
async function pendingUser(tag) {
  const email = `${tag}-${RUN}@consent.local`;
  const u = await req('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  return { id: u.id, email, jwt: await signIn(email, PASSWORD) };
}

const freshPhone = () => '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

await run('completing an account records the consent given on the screen that asked for it', async () => {
  const u = await pendingUser('ca');
  const before = await sel('profiles', `id=eq.${u.id}&select=id`);
  assert(before.length === 0, 'the account starts with no profile row');

  const at = Date.now();
  const res = await complete(u.jwt, {
    phone: freshPhone(),
    password: PASSWORD,
    // Whitespace on purpose: the same call proves the name is still normalised on the way in.
    full_name: '  Ana   Consent  ',
  });
  assert(res.status === 200, `complete-account returned ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const [p] = await sel('profiles', `id=eq.${u.id}&select=terms_accepted_at,email,phone,full_name`);
  assert(p, 'the profile row was created');
  assert(p.terms_accepted_at !== null && p.terms_accepted_at !== undefined,
    'terms_accepted_at is recorded — this is the defect: it used to stay NULL here');
  const recorded = Date.parse(p.terms_accepted_at);
  assert(Number.isFinite(recorded), `terms_accepted_at parses as a date, got ${p.terms_accepted_at}`);
  // Generous on both sides (clock skew between this process and the function's host), tight
  // enough that a hard-coded or client-echoed value could not pass.
  assert(recorded > at - 60_000 && recorded < Date.now() + 60_000,
    `terms_accepted_at is the moment of completion, got ${p.terms_accepted_at}`);

  assert(p.email === u.email, 'the profile carries the verified primary identifier');
  // The secondary is NOT attached here (M12): it lands only after the client's OTP round-trip.
  assert(p.phone === null, `the unverified secondary stays NULL, got ${p.phone}`);
  assert(p.full_name === 'Ana Consent', `the display name is normalised, got "${p.full_name}"`);
});

await run('the consent timestamp is the SERVER clock, not a value the caller supplies', async () => {
  // The whole point of recording it server-side: a client that wants to claim consent was given
  // in 2000 (or never) cannot. The field is simply not read off the body.
  const u = await pendingUser('ca-spoof');
  const res = await complete(u.jwt, {
    phone: freshPhone(),
    password: PASSWORD,
    full_name: 'Spoof Attempt',
    terms_accepted_at: '2000-01-01T00:00:00.000Z',
  });
  assert(res.status === 200, `complete-account returned ${res.status}`);

  const [p] = await sel('profiles', `id=eq.${u.id}&select=terms_accepted_at`);
  assert(Date.parse(p.terms_accepted_at) > Date.now() - 60_000,
    `the caller's timestamp was ignored, got ${p.terms_accepted_at}`);
});

await run('a rejected completion records no consent at all', async () => {
  // The row is written last, after the password check. A weak password 400s before it, so there
  // is no half-completed account carrying a consent timestamp and nothing else.
  const u = await pendingUser('ca-weak');
  const res = await complete(u.jwt, { phone: freshPhone(), password: 'padel1234', full_name: 'Weak Pass' });
  assert(res.status === 400, `a weak password is rejected, got ${res.status}`);
  const rows = await sel('profiles', `id=eq.${u.id}&select=terms_accepted_at`);
  assert(rows.length === 0, 'no profile row, and therefore no consent record, was created');
});
