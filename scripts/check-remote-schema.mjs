#!/usr/bin/env node
/**
 * Does the DEPLOYED database have the columns the shipped code selects?
 *
 * Written after a live TestFlight outage. Migration 0089 added
 * `profiles.notifications_prompted_at`, the app started selecting it on every
 * sign-in, and the migration was applied only to the LOCAL database. Production
 * returned 42703, `resolvePostAuthRoute` threw, and EVERY auth method — email,
 * Google, Apple — failed after a successful login. It looked like broken auth
 * for hours; it was one missing column.
 *
 * `verify-production-env.mjs` passed throughout, because it checks that env
 * values are well-SHAPED. Nothing checked that the schema behind them matched
 * the code.
 *
 * WHAT IT PROBES, and why it is derived rather than listed: the field names come
 * from `OnboardingProfile` in apps/mobile/lib/postVerifyRoute.ts, which is the
 * exact contract `postAuthRoute` selects on the auth path. Adding a field there
 * — which is what caused the outage — automatically extends this check. A
 * hand-maintained list would have needed the same discipline that failed.
 *
 * Uses the publishable key from eas.json. That key is already public (it ships
 * in the app binary), so this needs no secrets and runs in CI.
 *
 * Run: node scripts/check-remote-schema.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUEST_TIMEOUT_MS = 15_000;

/** Field names from the OnboardingProfile type — the auth path's select list. */
function onboardingProfileColumns() {
  const src = readFileSync(join(root, 'apps/mobile/lib/postVerifyRoute.ts'), 'utf8');
  const block = src.match(/export type OnboardingProfile = \{([\s\S]*?)\};/);
  if (!block) throw new Error('OnboardingProfile not found — did postVerifyRoute.ts move?');
  return [...block[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

/** Deployed targets, deduped: several build profiles usually share one project. */
function targets() {
  const eas = JSON.parse(readFileSync(join(root, 'apps/mobile/eas.json'), 'utf8'));
  const seen = new Map();
  for (const [profile, cfg] of Object.entries(eas.build ?? {})) {
    const url = cfg.env?.EXPO_PUBLIC_SUPABASE_URL;
    const key = cfg.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes('127.0.0.1') || url.includes('localhost')) continue;
    const id = `${url}|${key}`;
    if (seen.has(id)) seen.get(id).profiles.push(profile);
    else seen.set(id, { url, key, profiles: [profile] });
  }
  return [...seen.values()];
}

const columns = onboardingProfileColumns();
console.log(`[schema] profiles: ${columns.join(', ')}`);

let failed = 0;
let skipped = 0;

for (const t of targets()) {
  const label = t.profiles.join('/');
  let res;
  try {
    res = await fetch(`${t.url}/rest/v1/profiles?select=${columns.join(',')}&limit=1`, {
      headers: { apikey: t.key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Unreachable is NOT a schema failure. A paused project, or CI without
    // egress, must not turn into a red build that teaches people to ignore this.
    console.log(`? ${label}: unreachable (${error.message}) — schema not verified`);
    skipped += 1;
    continue;
  }

  if (res.ok) {
    console.log(`✓ ${label}: every column the auth path selects exists`);
    continue;
  }

  const body = await res.json().catch(() => ({}));
  // 42703 is undefined_column: the deployed database is behind the code.
  if (body.code === '42703') {
    console.log(`✗ ${label}: ${body.message}`);
    console.log('    A migration in infra/supabase/migrations is not applied to this project.');
    failed += 1;
  } else {
    console.log(`? ${label}: HTTP ${res.status} ${body.message ?? ''} — schema not verified`);
    skipped += 1;
  }
}

if (skipped > 0 && failed === 0) {
  console.log(`[schema] ${skipped} target(s) unverified; nothing proven about them.`);
}
if (failed === 0) console.log('[schema] ok');

process.exit(failed > 0 ? 1 : 0);
