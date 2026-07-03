#!/usr/bin/env node
/**
 * Validates EAS + web production env values against @padel/config schema.
 * Run: node scripts/verify-production-env.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPublicEnv } from '../packages/config/src/env.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const eas = JSON.parse(readFileSync(join(root, 'apps/mobile/eas.json'), 'utf8'));

const cases = [];

for (const [profile, cfg] of Object.entries(eas.build ?? {})) {
  const env = cfg.env ?? {};
  cases.push({
    label: `mobile:${profile}`,
    raw: {
      SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      APP_ENV: env.EXPO_PUBLIC_APP_ENV,
      SENTRY_DSN: env.EXPO_PUBLIC_SENTRY_DSN,
    },
  });
}

cases.push(
  { label: 'web:production', raw: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'k', APP_ENV: 'production' } },
  { label: 'sentry:empty-string', raw: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'k', APP_ENV: 'production', SENTRY_DSN: '' } },
);

let failed = 0;
for (const c of cases) {
  try {
    createPublicEnv(c.raw);
    console.log(`✓ ${c.label}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${c.label}: ${error.message.split('\n')[0]}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
