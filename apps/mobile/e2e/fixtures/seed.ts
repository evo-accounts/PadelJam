import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../driver/config';
import { runOk } from '../driver/proc';
import { psql } from './db';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SEED_SCRIPT = join(ROOT, 'infra', 'seed', 'seed-e2e.mjs');
const MANIFEST_PATH = join(__dirname, '..', 'artifacts', 'seed-manifest.json');

export interface SeedManifest {
  seededAt: string;
  users: Record<string, string>;
  communities: { A: string; C: string; P: string; R: string; S: string };
  // g1/g2 are community A's two named groups (A is on Basic, whose
  // groups_per_community of 3 also counts the auto-created general group, so two
  // is all it has room for). g3 "Secret Squad" is the private-group fixture and
  // lives in community R for the same reason. gS is community S's GENERAL group:
  // S is on Starter (cap 1), so that one group is the whole community and it
  // sits exactly at the cap. See infra/seed/seed-e2e.mjs.
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

/**
 * Refill PostGIS's spatial_ref_sys if an older wipe emptied it (it used to be truncated along
 * with everything else in public). Casts to geography survive an empty table on a built-in 4326
 * fallback, but st_distance / st_dwithin / <-> fail with "Cannot find SRID (4326)". The rows ship
 * in the extension's contrib dir inside the db container; the script ends ON CONFLICT DO NOTHING,
 * so it is safe to re-run. The table is owned by supabase_admin, hence the superuser.
 */
async function ensureSpatialRefSys(): Promise<void> {
  const has4326 = async () => (await psql('select count(*) from public.spatial_ref_sys where srid = 4326')).trim() === '1';
  if (await has4326()) return;
  const version = (await psql(`select extversion from pg_extension where extname = 'postgis'`)).trim();
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) throw new Error(`unexpected postgis version "${version}"`);
  const minor = version.split('.').slice(0, 2).join('.');
  const file = `/nix/store/*-postgis-${version}/share/postgresql/contrib/postgis-${minor}/spatial_ref_sys.sql`;
  await runOk('docker', [
    'exec', '-e', 'PGPASSWORD=postgres', CONFIG.dbContainer, 'sh', '-c',
    `psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f ${file}`,
  ], { timeoutMs: 120_000 });
  if (!(await has4326())) throw new Error('spatial_ref_sys still has no SRID 4326 — run `supabase db reset`.');
}

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
        select t.tablename from pg_tables t
        where t.schemaname = 'public'
          -- Migration-seeded reference data must survive the wipe: these tables
          -- are populated by a migration, never by the seed, so truncating them
          -- leaves them EMPTY for the rest of the run with nothing to refill
          -- them. plan_limits was missing here for months, and an empty
          -- plan_limits makes community_limit() return null for every key —
          -- which the cap triggers read as "unlimited", so no plan cap was ever
          -- enforced in an E2E run. Anything a migration inserts into the
          -- public schema belongs here (today: 0013_seed_plans, 0072_event_blasts).
          and t.tablename not in ('plans', 'plan_features', 'plan_limits', 'blast_templates',
                                  'spatial_ref_sys')
          -- Tables owned by an extension are never ours to wipe. PostGIS lives in
          -- public, and truncating its spatial_ref_sys leaves no SRID 4326, so
          -- every geography cast (viewer_distance_m, explore_events distance
          -- ranking, set_my_location, create_event) fails with "Cannot find SRID
          -- (4326) in spatial_ref_sys" until the next supabase db reset.
          -- Excluded by ownership (pg_depend deptype 'e'), not by name, so the
          -- next extension that installs a table in public is covered too.
          and not exists (
            select 1 from pg_depend d
            where d.classid = 'pg_class'::regclass
              and d.objid = format('public.%I', t.tablename)::regclass
              and d.refclassid = 'pg_extension'::regclass
              and d.deptype = 'e'
          )
      ) loop
        execute format('truncate table public.%I cascade', r.tablename);
      end loop;
    end $$;
    delete from auth.users;
  `);
  await ensureSpatialRefSys();
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
