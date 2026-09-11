// infra/seed/audit/run.ts
// node infra/seed/audit/run.ts --target local|hosted [--yes-hosted] [--purge] [--only users,communities,...]
import { loadEnv, OUT_DIR, type Target } from './env.ts';
import { makeClient } from './client.ts';
import type { Ctx } from './context.ts';
import { writeManifest } from './manifest.ts';
import { ALL_EMAILS } from './cast.ts';
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

async function main() {
  const target = (opt('target') ?? 'local') as Target;
  if (!['local', 'hosted'].includes(target)) { console.error(`--target must be local|hosted`); process.exit(1); }
  const env = loadEnv(target, flag('yes-hosted'));
  const c = makeClient(env);

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
  }
  const want = (step: string) => !only || only.includes(step);

  const ctx: Ctx = { c, users: {}, ids: {}, log: (m) => console.log(`  ${m}`) };
  const skipped: string[] = [];

  console.log(`Audit seed → ${env.target} (${env.url})`);
  if (flag('purge')) await purge(c);

  const present = await c.sel<{ email: string }[]>('profiles', `email=in.(${ALL_EMAILS.map(encodeURIComponent).join(',')})&select=email`);
  if (present.length && !only) {
    console.error(`Cast already present (${present.length} accounts). Re-run with --purge.`); process.exit(1);
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
