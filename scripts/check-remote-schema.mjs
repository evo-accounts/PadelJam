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
 * It also probes the RPCs the auth path calls, for the same reason: a function
 * that exists only locally fails exactly like the missing column did — the app
 * calls it, PostgREST answers PGRST202, and the screen dead-ends. `auth_methods_for`
 * (migration 0096) is on that list because "Try another way" calls it BEFORE the
 * user is authenticated, as anon, so a missing function or a missing anon grant
 * breaks sign-in recovery for people who are already locked out. `my_auth_providers`
 * (migration 0132) is there because it replaced a view the shipped app used to read, so a build
 * made before the hosted paste would ask for a function production does not have.
 *
 * And it asks every edge function the web app calls whether it answers the
 * browser's CORS preflight. Until 2026-10-07 (#285) six of them answered 405,
 * so blasts, chat, account completion and account deletion failed on web while
 * mobile (no preflight) worked. The source is guarded by cors.test.ts; this
 * guards the DEPLOY, which reaches the project as a pasted dashboard build and
 * can go back to an old one. The list is derived the same way: every function
 * apps/web or a shared package calls (scripts/edge-dashboard/browser-callers.mjs).
 *
 * Uses the publishable key from eas.json. That key is already public (it ships
 * in the app binary), so this needs no secrets and runs in CI.
 *
 * Run: node scripts/check-remote-schema.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BROWSER_REQUEST_HEADERS,
  browserCalledFunctions,
  classifyPreflight,
} from './edge-dashboard/browser-callers.mjs';

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
const browserFunctions = [...browserCalledFunctions(root).keys()];
console.log(`[schema] browser-called functions: ${browserFunctions.join(', ')}`);

/** 'ok' | 'fail' | 'skip' | 'unreachable' — 'unreachable' means don't bother with the rest. */
async function checkColumns(t, label) {
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
    return 'unreachable';
  }

  if (res.ok) {
    console.log(`✓ ${label}: every column the auth path selects exists`);
    return 'ok';
  }

  const body = await res.json().catch(() => ({}));
  // 42703 is undefined_column: the deployed database is behind the code.
  if (body.code === '42703') {
    console.log(`✗ ${label}: ${body.message}`);
    console.log('    A migration in infra/supabase/migrations is not applied to this project.');
    return 'fail';
  }
  console.log(`? ${label}: HTTP ${res.status} ${body.message ?? ''} — schema not verified`);
  return 'skip';
}

/**
 * Does auth_methods_for exist AND can anon call it?
 *
 * Probed with a throwaway identifier that matches no account, so the answer is the all-false row
 * an unknown identifier gets — nothing is enumerated and no real user is touched. The call does
 * write one rate-limit row (the limiter is inside the function); it is bucketed under a fresh
 * random identifier each run and pruned after fifteen minutes.
 */
async function checkAuthMethodsRpc(t, label) {
  const probe = `schema-check-${Math.random().toString(36).slice(2)}@invalid.padeljam`;
  let res;
  try {
    res = await fetch(`${t.url}/rest/v1/rpc/auth_methods_for`, {
      method: 'POST',
      headers: { apikey: t.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_identifier: probe }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.log(`? ${label}: auth_methods_for unreachable (${error.message}) — not verified`);
    return 'skip';
  }

  if (res.ok) {
    console.log(`✓ ${label}: auth_methods_for exists and anon may call it`);
    return 'ok';
  }

  const body = await res.json().catch(() => ({}));
  // PGRST202 (and 42883) is "no such function": migration 0096 has not been applied here.
  if (body.code === 'PGRST202' || body.code === '42883') {
    console.log(`✗ ${label}: auth_methods_for is missing (${body.message ?? res.status})`);
    console.log('    Migration 0096 is not applied to this project — "Try another way" will find nothing.');
    return 'fail';
  }
  // 42501 is insufficient_privilege: the function is there but the anon grant is not, which the
  // app cannot recover from either — the caller has no session to fall back to.
  if (body.code === '42501') {
    console.log(`✗ ${label}: anon may not execute auth_methods_for (${body.message ?? ''})`);
    console.log("    Re-apply 0096's grant block; a pre-auth lookup anon cannot call is dead.");
    return 'fail';
  }
  // The function's own limiter answering is proof it is deployed and reachable.
  if (typeof body.message === 'string' && /rate.?limit/i.test(body.message)) {
    console.log(`✓ ${label}: auth_methods_for exists (rate limiter answered)`);
    return 'ok';
  }
  console.log(`? ${label}: auth_methods_for HTTP ${res.status} ${body.message ?? ''} — not verified`);
  return 'skip';
}

/**
 * Does my_auth_providers exist, and is anon kept out of it?
 *
 * The Privacy row and Change password screen call it (migration 0132, which replaced the
 * auth_providers view). It is for signed-in users only, so the probe has no session to call it
 * with — and needs none: PostgREST answers 42501 for a function that exists but anon may not
 * execute, and PGRST202 for one that does not exist. The first is the deployed state we want.
 * Nothing is read and no row is written either way.
 */
async function checkMyAuthProvidersRpc(t, label) {
  let res;
  try {
    res = await fetch(`${t.url}/rest/v1/rpc/my_auth_providers`, {
      method: 'POST',
      headers: { apikey: t.key, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.log(`? ${label}: my_auth_providers unreachable (${error.message}) — not verified`);
    return 'skip';
  }

  const body = await res.json().catch(() => ({}));
  if (body.code === '42501') {
    console.log(`✓ ${label}: my_auth_providers exists and anon may not call it`);
    return 'ok';
  }
  if (body.code === 'PGRST202' || body.code === '42883') {
    console.log(`✗ ${label}: my_auth_providers is missing (${body.message ?? res.status})`);
    console.log('    Migration 0132 is not applied to this project — Privacy and Change password cannot tell');
    console.log('    whether the account has a password, and fall back to demanding the current one.');
    return 'fail';
  }
  // A 2xx means anon got in. The body answers anon with zero rows, so nothing leaks — but the grant
  // is what is supposed to keep anon out, not the WHERE clause.
  if (res.ok) {
    console.log(`✗ ${label}: anon may execute my_auth_providers`);
    console.log("    Re-apply 0132's grant block; it is for signed-in users only.");
    return 'fail';
  }
  console.log(`? ${label}: my_auth_providers HTTP ${res.status} ${body.message ?? ''} — not verified`);
  return 'skip';
}

const PREFLIGHT_ORIGIN = 'https://padeljam.app';

/**
 * Does every function the web app calls answer the browser's CORS preflight?
 *
 * Sends the OPTIONS a browser sends before a POST carrying the supabase-js headers. withCors
 * answers it before the handler runs, so no function logic executes and nothing is read or
 * written. A 404 fails (the web app calls a function the project does not have); a 5xx is left
 * unverified, like an unreachable project.
 */
async function checkBrowserPreflights(t, label) {
  const answers = await Promise.all(
    browserFunctions.map(async (fn) => {
      try {
        const res = await fetch(`${t.url}/functions/v1/${fn}`, {
          method: 'OPTIONS',
          headers: {
            Origin: PREFLIGHT_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': BROWSER_REQUEST_HEADERS.join(','),
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        await res.body?.cancel();
        return { fn, ...classifyPreflight(res, PREFLIGHT_ORIGIN) };
      } catch (error) {
        return { fn, result: 'skip', reason: `unreachable (${error.message})` };
      }
    }),
  );

  const failing = answers.filter((a) => a.result === 'fail');
  const unverified = answers.filter((a) => a.result === 'skip');
  for (const a of failing) console.log(`✗ ${label}: ${a.fn} does not answer the CORS preflight: ${a.reason}`);
  if (failing.length) {
    console.log('    The web app cannot call it from the browser. Its source must wrap the handler in');
    console.log('    withCors (cors.test.ts checks that); then redeploy what the repo has:');
    console.log(`    pnpm edge:dashboard-build ${failing.map((a) => a.fn).join(' ')}`);
    console.log('    and paste each build (scripts/build-dashboard-function.mjs says how).');
  }
  for (const a of unverified) console.log(`? ${label}: ${a.fn} preflight ${a.reason} — not verified`);
  if (!failing.length && !unverified.length) {
    console.log(`✓ ${label}: the ${answers.length} functions the web app calls answer the CORS preflight`);
  }
  return failing.length ? 'fail' : unverified.length ? 'skip' : 'ok';
}

let failed = 0;
let skipped = 0;

for (const t of targets()) {
  const label = t.profiles.join('/');
  const columnResult = await checkColumns(t, label);
  if (columnResult === 'unreachable') {
    skipped += 1;
    continue;
  }
  if (columnResult === 'fail') failed += 1;
  if (columnResult === 'skip') skipped += 1;

  for (const check of [checkAuthMethodsRpc, checkMyAuthProvidersRpc, checkBrowserPreflights]) {
    const rpcResult = await check(t, label);
    if (rpcResult === 'fail') failed += 1;
    if (rpcResult === 'skip') skipped += 1;
  }
}

if (skipped > 0 && failed === 0) {
  console.log(`[schema] ${skipped} check(s) unverified; nothing proven about them.`);
}
if (failed === 0) console.log('[schema] ok');

process.exit(failed > 0 ? 1 : 0);
