import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { psql } from './db';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SEED_SCRIPT = join(ROOT, 'infra', 'seed', 'seed-e2e.mjs');
const MANIFEST_PATH = join(__dirname, '..', 'artifacts', 'seed-manifest.json');

export interface SeedManifest {
  seededAt: string;
  users: Record<string, string>;
  communities: { A: string; C: string; P: string; R: string; S: string };
  groups: { g1: string; g2: string; g3: string; gR: string; gS: string };
  events: {
    e1: string; e2: string; e3: string; e4: string; e5: string; e6: string; e7: string; e8: string;
    // Fixtures the RPCs cannot express on their own — see suppressInvitations()
    // in infra/seed/seed-e2e.mjs. e9/e10/e12 carry NO invitations; e11 is the
    // only time-scored event, which is what gates the live screen's Timer tab.
    e9: string; e10: string; e11: string; e12: string;
  };
}

let cached: SeedManifest | null = null;

/** Wipe all app data (public tables, auth users, storage objects) without a full supabase db reset. */
export async function wipeDb(): Promise<void> {
  // storage.protect_delete() blocks direct deletes; superuser + replica role bypasses it.
  await psql(
    `set session_replication_role = replica;
     delete from storage.objects;
     set session_replication_role = default;`,
    { su: true },
  );
  await psql(`
    do $$
    declare r record;
    begin
      for r in (
        select tablename from pg_tables
        where schemaname = 'public'
          -- migration-seeded reference data must survive the wipe
          and tablename not in ('plans', 'plan_features')
      ) loop
        execute format('truncate table public.%I cascade', r.tablename);
      end loop;
    end $$;
    delete from auth.users;
  `);
  // Verify BOTH sides: auth.users deletion is FK-restricted by public tables
  // (tenants.owner_id), so a partial wipe leaves users behind and every later
  // seed fails with a duplicate-email 500. Retry once, then fail loudly.
  const counts = async () => {
    const out = await psql('select (select count(*) from public.profiles) || \'/\' || (select count(*) from auth.users)');
    return out.trim();
  };
  if ((await counts()) !== '0/0') {
    await psql('delete from auth.users');
    const after = await counts();
    if (after !== '0/0') throw new Error(`wipeDb incomplete (profiles/auth.users = ${after})`);
  }
}

/** Wipe + reseed; parses the E2E_MANIFEST line the seed script prints. */
export function runSeed(profile: 'minimal' | 'full' = 'full'): SeedManifest {
  const res = spawnSync('node', [SEED_SCRIPT, '--profile', profile], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  if (res.status !== 0) throw new Error(`seed-e2e failed (${res.status}):\n${out.slice(-2000)}`);
  const line = out.split('\n').find((l) => l.startsWith('E2E_MANIFEST '));
  const manifest: SeedManifest = line
    ? JSON.parse(line.slice('E2E_MANIFEST '.length))
    : ({ seededAt: new Date().toISOString(), users: {}, communities: {}, groups: {}, events: {} } as SeedManifest);
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  cached = manifest;
  return manifest;
}

export async function resetDb(profile: 'minimal' | 'full' = 'full'): Promise<SeedManifest> {
  await wipeDb();
  return runSeed(profile);
}

/** Manifest from the most recent seed (in-memory or persisted by a previous process). */
export function manifest(): SeedManifest {
  if (cached) return cached;
  if (existsSync(MANIFEST_PATH)) {
    cached = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as SeedManifest;
    return cached;
  }
  throw new Error('No seed manifest — call resetDb()/runSeed() first (the orchestrator does this).');
}
