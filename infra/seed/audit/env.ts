// infra/seed/audit/env.ts
// Loads .env from the repo root, plus .env.audit ONLY for --target hosted (so a machine holding hosted
// keys can still run local). Hosted needs every key and an explicit opt-in.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const OUT_DIR = resolve(ROOT, 'infra/seed/audit/out');

export type Target = 'local' | 'hosted';
export type Env = {
  target: Target;
  url: string;
  service: string;
  anon: string;
  streamKey: string | null;
};

function readDotenv(file: string, into: Record<string, string>) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && into[m[1]] === undefined) into[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* optional file */ }
}

export function loadEnv(target: Target, yesHosted: boolean): Env {
  const vars: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (target === 'hosted') readDotenv(resolve(ROOT, '.env.audit'), vars);
  readDotenv(resolve(ROOT, '.env'), vars);
  const trim = (u: string) => u.replace(/\/+$/, '');

  if (target === 'local') {
    const url = trim(vars.SUPABASE_URL || 'http://127.0.0.1:55321');
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) throw new Error(`--target local but SUPABASE_URL is ${url}`);
    if (!vars.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    return {
      target, url, service: vars.SUPABASE_SERVICE_ROLE_KEY,
      anon: vars.SUPABASE_ANON_KEY || vars.SUPABASE_SERVICE_ROLE_KEY,
      streamKey: vars.EXPO_PUBLIC_STREAM_API_KEY || null,
    };
  }

  // hosted
  if (!yesHosted) throw new Error('--target hosted requires --yes-hosted');
  const eas = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/eas.json'), 'utf8')) as {
    build: Record<string, { env?: Record<string, string> }>;
  };
  const shipped = eas.build.production?.env?.EXPO_PUBLIC_SUPABASE_URL
    ?? Object.values(eas.build).map((b) => b.env?.EXPO_PUBLIC_SUPABASE_URL).find(Boolean);
  if (!shipped) throw new Error('eas.json has no EXPO_PUBLIC_SUPABASE_URL');
  const shippedHost = new URL(shipped).host;
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'EXPO_PUBLIC_STREAM_API_KEY']) {
    if (!vars[k]) throw new Error(`Missing ${k} for --target hosted (put it in .env.audit)`);
  }
  if (new URL(vars.SUPABASE_URL).host !== shippedHost) {
    throw new Error(`SUPABASE_URL ${vars.SUPABASE_URL} is not the project the app ships (${shippedHost})`);
  }
  return {
    target, url: trim(vars.SUPABASE_URL), service: vars.SUPABASE_SERVICE_ROLE_KEY,
    anon: vars.SUPABASE_ANON_KEY, streamKey: vars.EXPO_PUBLIC_STREAM_API_KEY,
  };
}
