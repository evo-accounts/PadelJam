// infra/supabase/tests/auth-methods.test.mjs
// auth_methods_for (migration 0096): the pre-authentication lookup behind "Try another way".
// Everything here calls it as ANON, because that is how the app calls it — there is no session
// at the point the sheet opens, and the service key would bypass the grant the feature depends on.
import { adminCreateUser, anonRpc, sel, patch, del, expectError, assert, run } from './lib.mjs';

const RUN = process.env.TEST_RUN || Date.now().toString(36);
const ID_LIMIT = 5;
const IP_LIMIT = 30;

/** The function always yields exactly one row; `returns table` still sends an array. */
const lookup = async (identifier) => {
  const rows = await anonRpc('auth_methods_for', { p_identifier: identifier });
  assert(Array.isArray(rows) && rows.length === 1, `one row for ${identifier}`);
  return rows[0];
};

// The rate-limit ledger is RLS'd with zero policies, so only the service key (which bypasses RLS)
// can reset it between phases. Without this, the per-address bucket — 30 in 15 minutes, shared by
// every call this file makes — would trip somewhere in the middle and fail unrelated assertions.
const clearLedger = () => del('auth_lookup_attempts', 'at=gte.1970-01-01');
/** Backdate every attempt so it falls outside the window, without waiting fifteen real minutes. */
const ageLedger = (minutes) =>
  patch('auth_lookup_attempts', 'at=gte.1970-01-01', {
    at: new Date(Date.now() - minutes * 60_000).toISOString(),
  });

// A user with NO profiles row: adminCreateUser touches auth.users only. This is the mid-signup
// state the feature exists for, and it is why the function reads auth.users and not profiles.
const EMAIL = `am-${RUN}@authmethods.local`;
const PHONE = '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
await adminCreateUser(EMAIL, PHONE, 'Padel1234#');

await clearLedger();

await run('an email finds the account, with no profiles row in sight', async () => {
  const r = await lookup(EMAIL);
  assert(r.has_email === true, 'has_email');
  assert(r.has_phone === true, 'has_phone');
  assert(r.has_password === true, 'has_password');
  // Never inferred from the address: this account has no auth.identities row for either provider.
  assert(r.has_google === false, 'has_google is false');
  assert(r.has_apple === false, 'has_apple is false');
  const profiles = await sel('profiles', `email=eq.${EMAIL}&select=id`);
  assert(profiles.length === 0, 'the account really has no profile row');
});

await run('an email matches case-insensitively and ignores surrounding space', async () => {
  const r = await lookup(`  ${EMAIL.toUpperCase()}  `);
  assert(r.has_email === true && r.has_password === true, 'upper-cased, padded email still matches');
});

await run('a phone matches WITH and WITHOUT the leading +', async () => {
  // GoTrue stores auth.users.phone without the '+'; clients send E.164 with it. Both spellings
  // must resolve to the same account or every phone-first user is told they have no methods.
  const withPlus = await lookup(PHONE);
  const without = await lookup(PHONE.replace(/^\+/, ''));
  assert(withPlus.has_phone === true && withPlus.has_email === true, '+E.164 found the account');
  assert(without.has_phone === true && without.has_email === true, 'bare digits found the account');
  assert(withPlus.phone_masked === without.phone_masked, 'both spellings mask identically');
});

await run('an unknown identifier answers all-false, with no "found" flag to read', async () => {
  const unknown = await lookup(`am-nobody-${RUN}@authmethods.local`);
  assert(Object.keys(unknown).length === 7, 'exactly the seven documented columns, no found flag');
  for (const k of ['has_email', 'has_phone', 'has_google', 'has_apple', 'has_password']) {
    assert(unknown[k] === false, `${k} is false`);
  }
  assert(unknown.email_masked === null && unknown.phone_masked === null, 'no masks either');
  // Indistinguishable from a real account whose only method is the one already in use.
  const unknownPhone = await lookup('+351900000000');
  assert(JSON.stringify(unknownPhone) === JSON.stringify(unknown), 'unknown phone and unknown email agree');
  // The empty string must not match a phone-only account, whose auth.users.email GoTrue stores
  // as '' rather than NULL.
  const empty = await lookup('');
  assert(JSON.stringify(empty) === JSON.stringify(unknown), 'an empty identifier matches nobody');
});

await run('the masks never carry the raw identifier out of the database', async () => {
  await ageLedger(20); // the reads above burned this identifier's allowance
  const r = await lookup(EMAIL);

  const [local, domain] = EMAIL.split('@');
  assert(r.email_masked !== EMAIL, 'the email mask is not the email');
  assert(!r.email_masked.includes(local), 'the full local part is not in the mask');
  assert(r.email_masked === `${local[0]}•••@${domain}`, `first letter + domain only, got ${r.email_masked}`);

  const digits = PHONE.replace(/^\+/, '');
  assert(r.phone_masked !== PHONE && r.phone_masked !== digits, 'the phone mask is not the phone');
  assert(!r.phone_masked.includes(digits.slice(3, -4)), 'the hidden middle is really hidden');
  // Three leading digits plus the last four, and nothing else: seven digits in the whole string.
  const shown = r.phone_masked.replace(/[^0-9]/g, '');
  assert(shown.length === 7, `only 7 digits survive masking, got ${shown.length} in ${r.phone_masked}`);
  assert(r.phone_masked.endsWith(digits.slice(-4)), 'the last four are the last four');
  assert(!r.phone_masked.includes(digits.slice(-5, -4) + digits.slice(-4)), 'not a fifth trailing digit');
});

await run(`the identifier limit trips on call ${ID_LIMIT + 1}`, async () => {
  await clearLedger();
  const target = `am-rl-${RUN}@authmethods.local`;
  for (let i = 0; i < ID_LIMIT; i++) await lookup(target);
  await expectError(() => anonRpc('auth_methods_for', { p_identifier: target }), 'rate_limited');
  // Per identifier, not global: a different identifier still answers.
  await lookup(`am-rl-other-${RUN}@authmethods.local`);
});

await run('the two spellings of one phone share an identifier bucket', async () => {
  await clearLedger();
  const e164 = '+351911111111';
  for (let i = 0; i < ID_LIMIT; i++) await lookup(e164);
  // Dropping the '+' must not buy a fresh allowance.
  await expectError(() => anonRpc('auth_methods_for', { p_identifier: e164.slice(1) }), 'rate_limited');
});

await run('the window expiring resets the count', async () => {
  const target = `am-window-${RUN}@authmethods.local`;
  await clearLedger();
  for (let i = 0; i < ID_LIMIT; i++) await lookup(target);
  await expectError(() => anonRpc('auth_methods_for', { p_identifier: target }), 'rate_limited');
  await ageLedger(20); // older than the 15-minute window
  const r = await lookup(target);
  assert(r.has_email === false, 'the call goes through again once the window has passed');
  // The backdated rows are gone: the function prunes the window before it counts.
  const left = await sel('auth_lookup_attempts', 'select=bucket');
  assert(left.length <= 2, `stale rows were pruned, ${left.length} left`);
});

await run(`the caller-address limit trips on call ${IP_LIMIT + 1}`, async () => {
  await clearLedger();
  await lookup(`am-ip-probe-${RUN}@authmethods.local`);
  const buckets = await sel('auth_lookup_attempts', 'select=bucket');
  if (!buckets.some((b) => b.bucket.startsWith('ip:'))) {
    // The secondary limit needs an x-forwarded-for header from the gateway. If this stack does not
    // set one, the function correctly falls back to the identifier limit alone — the behaviour the
    // "must not throw when the setting is absent" guard exists for — and there is nothing to trip.
    console.log('  … no x-forwarded-for on this stack: address limit not exercised');
    return;
  }
  await clearLedger();
  // Distinct identifiers every time, so the identifier limit can never be what trips.
  for (let i = 0; i < IP_LIMIT; i++) await lookup(`am-ip-${i}-${RUN}@authmethods.local`);
  await expectError(
    () => anonRpc('auth_methods_for', { p_identifier: `am-ip-last-${RUN}@authmethods.local` }),
    'rate_limited',
  );
  await ageLedger(20);
  await lookup(`am-ip-after-${RUN}@authmethods.local`);
});

await clearLedger();
