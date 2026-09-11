// infra/seed/audit/handover.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT_DIR } from './env.ts';
import { A1, A2, NAMED, PASSWORD } from './cast.ts';
import type { Manifest } from './manifest.ts';

export function writeHandover(m: Manifest) {
  const acting = NAMED.filter((p) => p.acting);
  const row = (label: string, email: string, phone: string, note: string) => `| ${label} | ${email} | ${phone} | ${PASSWORD} | ${note} |`;
  const lines = [
    `# Padel Jam — audit hand-over (${m.target}, seeded ${m.seededAt})`, '',
    'Sign in by phone with the fixed code registered in the Supabase dashboard (recommended), or by email with the real mailbox.', '',
    '## Accounts', '',
    '| Id | Email | Phone | Password | Notes |', '|---|---|---|---|---|',
    row('A1', A1.email, A1.phone, 'Main audit account. Owns C1.'),
    row('A2', A2.email, A2.phone, 'Does not exist: sign up with it. Reset with --purge.'),
    ...acting.map((p) => row(p.key.toUpperCase(), p.email, p.phone, p.acting!)),
    '', '## Fixture ids', '',
    '| Key | Id |', '|---|---|',
    ...Object.entries(m.ids).map(([k, v]) => `| ${k} | ${v} |`),
    '', '## Live transitions (two sessions)', '',
    '- N4 spot release: sign in as F5 on a second device and leave E6; A1 receives "A spot opened" with Confirm spot.',
    '- Score lock: in E2 (players may submit), sign in as F5 and submit a score; A1 sees it locked.',
    '- N6 date change: sign in as F4, edit the date of "Treino Remarcado" (E_UPDATED, A1 is confirmed there); A1 receives "was updated".',
    '', '## Skipped', '', ...(m.skipped.length ? m.skipped.map((s) => `- ${s}`) : ['- nothing']),
    '', 'See docs/audit/README.md for what the seed cannot honour and why.',
  ];
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `audit-handover.${m.target}.md`), lines.join('\n'));
}
