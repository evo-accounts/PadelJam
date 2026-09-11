// infra/seed/audit/run.ts
// node infra/seed/audit/run.ts --target local|hosted [--yes-hosted] [--purge] [--only users,communities,...]
// node infra/seed/audit/run.ts --target local|hosted [--yes-hosted] --resume --only chat
//   --resume signs the cast back in from the existing manifest.<target>.json instead of creating
//   it fresh, and skips the cast-presence refusal and the purge. Only the chat step is safe to
//   re-run this way (others would double-plant rows), so --resume requires --only chat.
import { loadEnv, OUT_DIR, type Target } from './env.ts';
import { makeClient } from './client.ts';
import type { Ctx } from './context.ts';
import { writeManifest, readManifest } from './manifest.ts';
import { ALL_EMAILS, ALL, PASSWORD } from './cast.ts';
import { seedUsers } from './users.ts';
import { seedVenues } from './venues.ts';
import { seedCommunities } from './communities.ts';
import { seedGroups } from './groups.ts';
import { seedEvents } from './events.ts';
import { seedNotifications } from './notifications.ts';
import { seedChat } from './chat.ts';
import { purge } from './purge.ts';
import { writeHandover } from './handover.ts';

const STEPS = ['users', 'venues', 'communities', 'groups', 'events', 'notifications', 'chat'] as const;

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };

/** Reads the `sub` claim (the user id) out of a JWT without verifying it — fine here since the
 * token just came back from our own GoTrue's sign-in response. */
function jwtSub(jwt: string): string {
  const payload = jwt.split('.')[1];
  if (!payload) throw new Error('malformed jwt: no payload segment');
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
  if (!json.sub) throw new Error('jwt has no sub claim');
  return json.sub;
}

async function main() {
  const target = (opt('target') ?? 'local') as Target;
  if (!['local', 'hosted'].includes(target)) { console.error(`--target must be local|hosted`); process.exit(1); }
  const env = loadEnv(target, flag('yes-hosted'));
  const c = makeClient(env);
  const resume = flag('resume');

  let only: string[] | null = null;
  if (flag('only')) {
    const onlyRaw = opt('only');
    only = onlyRaw && !onlyRaw.startsWith('--') ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (only.length === 0) { console.error(`--only requires a comma-separated list, e.g. --only ${STEPS[0]}`); process.exit(1); }
    const unknown = only.filter((s) => !(STEPS as readonly string[]).includes(s));
    if (unknown.length) {
      console.error(`--only: unknown step(s) ${unknown.join(', ')}. Known steps: ${STEPS.join(', ')}`);
      process.exit(1);
    }
    if (!resume && only[0] !== 'users') {
      console.error(`--only must begin with users: later steps sign in through the sessions users creates`);
      process.exit(1);
    }
  }
  if (resume && (!only || only.length !== 1 || only[0] !== 'chat')) {
    console.error(`--resume only supports --only chat: the other steps are not safe to re-run against an already-seeded project (e.g. notifications would double-plant rows)`);
    process.exit(1);
  }
  const want = (step: string) => !only || only.includes(step);

  const ctx: Ctx = { c, users: {}, ids: {}, log: (m) => console.log(`  ${m}`) };
  const skipped: string[] = [];

  console.log(`Audit seed → ${env.target} (${env.url})`);

  if (resume) {
    const manifest = readManifest(env.target);
    ctx.ids = { ...manifest.ids };
    for (const p of ALL) {
      const expectedId = manifest.users[p.key];
      if (!expectedId) throw new Error(`--resume: manifest.${env.target}.json has no id for ${p.key}`);
      const jwt = await c.signIn(p.email, PASSWORD);
      const signedInId = jwtSub(jwt);
      if (signedInId !== expectedId) {
        throw new Error(`--resume: signed-in id for ${p.key} (${signedInId}) does not match the manifest (${expectedId})`);
      }
      ctx.users[p.key] = { id: expectedId, jwt, person: p };
    }
    ctx.log(`resume: signed ${ALL.length} cast members back in from manifest.${env.target}.json`);
  } else {
    if (flag('purge')) await purge(c);
    const present = await c.sel<{ email: string }[]>('profiles', `email=in.(${ALL_EMAILS.map(encodeURIComponent).join(',')})&select=email`);
    if (present.length && !only) {
      console.error(`Cast already present (${present.length} accounts). Re-run with --purge.`); process.exit(1);
    }
  }

  if (want('users')) await seedUsers(ctx);
  if (want('venues')) await seedVenues(ctx);
  if (want('communities')) await seedCommunities(ctx);
  if (want('groups')) await seedGroups(ctx);
  if (want('events')) await seedEvents(ctx);
  if (want('notifications')) await seedNotifications(ctx);
  if (want('chat')) {
    const r = await seedChat(ctx);
    if (r.skipped) skipped.push(`chat: ${r.skipped}`);
  }

  const manifest = {
    seededAt: new Date().toISOString(), target: env.target,
    users: Object.fromEntries(Object.entries(ctx.users).map(([k, v]) => [k, v.id])),
    ids: ctx.ids, skipped,
  };
  writeManifest(manifest);
  writeHandover(manifest);
  console.log('\nCounts:');
  for (const t of ['profiles', 'communities', 'groups', 'events', 'event_participants', 'follows', 'notifications', 'partner_requests']) {
    console.log(`  ${t}: ${await c.count(t)}`);
  }
  if (skipped.length) console.log(`\nSkipped: ${skipped.join('; ')}`);
  console.log(`\nDone. Manifest: ${OUT_DIR}/manifest.${env.target}.json`);
}

main().catch((e) => {
  console.error('\nSEED FAILED:', e.message);
  console.error('Partial state may remain; re-run with --purge.');
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
