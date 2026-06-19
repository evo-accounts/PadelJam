# PT-PT / PT-BR Translation Backfill (A5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every mobile i18n namespace full `pt-PT` and `pt-BR` blocks matching its `en` keys, register all locales, and guard the result with a parity test.

**Architecture:** Add `pt-PT`/`pt-BR` blocks (mirroring each `en` block's keys, translated) to the 8 English-only namespace consts in `apps/mobile/lib/i18n-mobile.ts`; fill the auth/community gaps; refactor `registerMobileCopy` to register all locales via a loop over an exported `MOBILE_NAMESPACES` map; add a vitest parity test asserting key-set equality + placeholder preservation across locales.

**Tech Stack:** TypeScript i18n data, i18next `addResourceBundle`, vitest (new in `apps/mobile`).

**Spec:** [docs/superpowers/specs/2026-06-19-i18n-pt-backfill-design.md](specs/2026-06-19-i18n-pt-backfill-design.md)

---

## Shared translation rules (apply in EVERY translation task)

For each namespace, add a `'pt-PT': { … }` and `'pt-BR': { … }` object to its const with **exactly the same keys
as the `en` block** — same key names, including `_one`/`_other` plural variants; none missing, none extra.

- **Preserve every `{{token}}` verbatim** (`{{actor}}`, `{{target}}`, `{{entity}}`, `{{count}}`, `{{seconds}}`,
  `{{identifier}}`, `{{name}}`, `{{average}}`, …). Same tokens, same spelling; do not translate or drop them.
- **"Padel Jam" stays "Padel Jam".**
- **Dialect differences (pt-PT vs pt-BR) are required, not optional.** Examples: team → "equipa" (PT) / "time"
  (BR); user → "utilizador" (PT) / "usuário" (BR); "ecrã" (PT) / "tela" (BR); "telemóvel" (PT) / "celular"
  (BR); 2nd-person tone "tu/você" per natural usage. Padel terms: court → "campo"; keep "americano",
  "mexicano". Use the same i18next plural keys (`_one`/`_other`) the `en` block uses.
- **Self-check before committing:** the count and names of keys in `pt-PT` and `pt-BR` must equal `en` for that
  namespace, and each value's `{{…}}` tokens must match the English value's. (Task 6's parity test is the
  authoritative net, but verify per task to avoid late surprises.)
- Touch ONLY the namespace(s) named in your task. Do not reorder or edit `en`. Do not change
  `registerMobileCopy` (that's Task 6).

Verification for every translation task: `pnpm -w typecheck` → 13/13 (the `as const` edits must still typecheck).

---

## Task 1: Small namespaces — notifications, home, discovery, events

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts` (consts `mobileNotifications`, `mobileHome`, `mobileDiscovery`, `mobileEvents`).

- [ ] **Step 1:** For each of `mobileNotifications` (~25 keys), `mobileHome` (~23), `mobileDiscovery` (~18), `mobileEvents` (~6): read its `en` block and add `'pt-PT'` + `'pt-BR'` blocks per the Shared translation rules. Place the two new blocks immediately before the `en:` block in each const (so the shape is `{ 'pt-PT': {...}, 'pt-BR': {...}, en: {...} }`).
  - Anchor examples — notifications (`{{actor}}`/`{{entity}}` preserved): `event_cancelled: '{{entity}} was cancelled'` → pt-PT `'{{entity}} foi cancelado'`, pt-BR `'{{entity}} foi cancelado'`; `event_updated: '{{entity}} was updated — check the new details'` → pt-PT `'{{entity}} foi atualizado — vê os novos detalhes'`, pt-BR `'{{entity}} foi atualizado — confira os novos detalhes'`.
- [ ] **Step 2:** `pnpm -w typecheck` → 13/13.
- [ ] **Step 3:** Self-check key parity for the 4 namespaces (keys of pt-PT/pt-BR == en; placeholders match).
- [ ] **Step 4:** Commit:
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "i18n(pt): translate notifications/home/discovery/events namespaces (A5)"
```

---

## Task 2: chat + fill auth & community gaps

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts` (const `mobileChat`; add missing keys to existing `pt-PT`/`pt-BR` of `mobileAuth` and `mobileCommunity`).

- [ ] **Step 1:** `mobileChat` (~27 keys): add `'pt-PT'` + `'pt-BR'` blocks mirroring `en` (Shared rules).
- [ ] **Step 2:** `mobileAuth`: its `en` has ~28 keys not present in `pt-PT`/`pt-BR`. For EACH key in `mobileAuth.en` missing from `mobileAuth['pt-PT']`, add a translated entry; same for `pt-BR`. (Identify the missing keys by diffing the key sets.) Preserve placeholders like `{{seconds}}`, `{{identifier}}`. OAuth/provider keys (`oauth_*`, `continueWithGoogle`) and "Padel Jam" follow the rules. Anchor: `cooldown: 'Resend in {{seconds}}s'` → pt-PT `'Reenviar em {{seconds}}s'`, pt-BR `'Reenviar em {{seconds}}s'`.
- [ ] **Step 3:** `mobileCommunity`: add the ~3 keys present in `en` but missing from `pt-PT`/`pt-BR` (`resultCardTitle`, `viewEventCta`, `resultUnavailable` per the audit — verify by diffing). Translate into both.
- [ ] **Step 4:** `pnpm -w typecheck` → 13/13.
- [ ] **Step 5:** Self-check: `mobileChat`/`mobileAuth`/`mobileCommunity` pt-PT & pt-BR key sets now equal their `en` key sets.
- [ ] **Step 6:** Commit:
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "i18n(pt): translate chat + fill auth/community gaps (A5)"
```

---

## Task 3: group namespace

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts` (const `mobileGroup`, ~95 keys).

- [ ] **Step 1:** Read `mobileGroup.en`; add `'pt-PT'` + `'pt-BR'` blocks mirroring its keys (Shared rules). Group-management terms: "group" → "grupo"; "admin" → "administrador"; "member" → "membro" (`{{count}}` plurals preserved).
- [ ] **Step 2:** `pnpm -w typecheck` → 13/13.
- [ ] **Step 3:** Self-check key parity + placeholders.
- [ ] **Step 4:** Commit:
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "i18n(pt): translate group namespace (A5)"
```

---

## Task 4: profile namespace

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts` (const `mobileProfile`, ~109 keys).

- [ ] **Step 1:** Read `mobileProfile.en`; add `'pt-PT'` + `'pt-BR'` blocks (Shared rules). Note `shareMessage` keeps "Padel Jam". Settings/account terms differ by dialect (e.g. "definições" (PT) / "configurações" (BR)).
- [ ] **Step 2:** `pnpm -w typecheck` → 13/13.
- [ ] **Step 3:** Self-check key parity + placeholders.
- [ ] **Step 4:** Commit:
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "i18n(pt): translate profile namespace (A5)"
```

---

## Task 5: event namespace (largest)

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts` (const `mobileEvent`, ~368 keys).

- [ ] **Step 1:** Read the full `mobileEvent.en` block; add `'pt-PT'` + `'pt-BR'` blocks mirroring ALL its keys (Shared rules). This is the create/manage wizard + activity log + blast + deadlines + delivery copy (A1–A4). Domain anchors: "court" → "campo"; "standby" → "suplentes/reserva"; "scoring" → "pontuação"; team → "equipa" (PT) / "time" (BR); the activity verbs (`activityJoined: '{{actor}} joined'` → pt-PT `'{{actor}} juntou-se'`, pt-BR `'{{actor}} entrou'`; `activityGroup_*` words: date→"data", location→"localização"/"local", scoring→"pontuação", preferences→"preferências", details→"detalhes"). Keep `{{actor}}`/`{{target}}`/`{{count}}` intact.
  - **If the single edit is unwieldy,** add the `pt-PT` block fully, typecheck, then the `pt-BR` block — but commit only once at the end of this task with both complete.
- [ ] **Step 2:** `pnpm -w typecheck` → 13/13.
- [ ] **Step 3:** Self-check: `mobileEvent['pt-PT']` and `['pt-BR']` key sets each equal `mobileEvent.en` (no missing keys across ~368), placeholders preserved.
- [ ] **Step 4:** Commit:
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "i18n(pt): translate event namespace (A5)"
```

---

## Task 6: register all locales + parity test

**Files:**
- Modify `apps/mobile/lib/i18n-mobile.ts` (export `MOBILE_NAMESPACES`; rewrite `registerMobileCopy`)
- Create `apps/mobile/vitest.config.ts`
- Modify `apps/mobile/package.json` (test script + vitest devDep)
- Create `apps/mobile/lib/i18n-mobile.test.ts`

By now every namespace const has `pt-PT`, `pt-BR`, and `en` blocks with equal key sets.

- [ ] **Step 1: Export the namespace map + rewrite `registerMobileCopy`.**

At the end of `i18n-mobile.ts`, replace the existing `registerMobileCopy` with:
```ts
export const MOBILE_NAMESPACES = {
  auth: mobileAuth, onboarding: mobileOnboarding, community: mobileCommunity, group: mobileGroup,
  event: mobileEvent, discovery: mobileDiscovery, home: mobileHome, notifications: mobileNotifications,
  events: mobileEvents, profile: mobileProfile, chat: mobileChat,
} as const;

export function registerMobileCopy(instance: I18n): void {
  for (const [ns, blocks] of Object.entries(MOBILE_NAMESPACES)) {
    (Object.keys(blocks) as MobileLocale[]).forEach((locale) => {
      instance.addResourceBundle(locale, ns, (blocks as Record<string, object>)[locale], true, false);
    });
  }
}
```
(Keep the `addResourceBundle(…, true, false)` signature. `MobileLocale` is the existing locale-key type — reuse it; if it isn't exported/defined, use `'pt-PT' | 'pt-BR' | 'en'`.)

- [ ] **Step 2: Add vitest to `apps/mobile`.**

In `apps/mobile/package.json`: add `"test": "vitest run"` to `scripts`, and `"vitest": "^2.1.0"` to `devDependencies` (match `packages/i18n`'s version). Create `apps/mobile/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
});
```
Then run `pnpm install` (from the repo root) so the vitest binary resolves for the `mobile` package.

- [ ] **Step 3: Write the parity test.**

Create `apps/mobile/lib/i18n-mobile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { MOBILE_NAMESPACES } from './i18n-mobile';

const tokens = (s: string): string[] =>
  ((s.match(/\{\{\s*(\w+)\s*\}\}/g) ?? []).map((t) => t.replace(/\s/g, ''))).sort();

describe('mobile i18n locale parity', () => {
  for (const [ns, blocks] of Object.entries(MOBILE_NAMESPACES)) {
    const en = (blocks as Record<string, Record<string, string>>).en;
    for (const locale of ['pt-PT', 'pt-BR'] as const) {
      const loc = (blocks as Record<string, Record<string, string>>)[locale];
      it(`${ns}/${locale} has the same keys as en`, () => {
        expect(loc).toBeDefined();
        expect(Object.keys(loc).sort()).toEqual(Object.keys(en).sort());
      });
      it(`${ns}/${locale} preserves placeholders`, () => {
        for (const k of Object.keys(en)) {
          expect(tokens(loc[k] ?? '')).toEqual(tokens(en[k]));
        }
      });
    }
  }
});
```

- [ ] **Step 4: Run the test + typecheck.**

Run: `pnpm --filter mobile test`
Expected: all parity specs pass for 11 namespaces × {pt-PT, pt-BR}. If a spec fails, it names the exact `namespace/locale` (and a placeholder mismatch points to a value) — fix that key in the relevant translation block.
Run: `pnpm -w typecheck` → 13/13.

- [ ] **Step 5: Commit:**
```bash
git add apps/mobile/lib/i18n-mobile.ts apps/mobile/vitest.config.ts apps/mobile/package.json apps/mobile/lib/i18n-mobile.test.ts pnpm-lock.yaml
git commit -m "i18n(pt): register all locales + parity test (A5)"
```

---

## Verification (end-to-end)

1. **Parity test:** `pnpm --filter mobile test` → every namespace's `pt-PT` and `pt-BR` key sets equal `en` and placeholders are preserved.
2. **Types:** `pnpm -w typecheck` (13/13).
3. **App (simulator):** set the device/profile locale to `pt-PT`, then `pt-BR` → event create/manage, profile, groups, chat, home, notifications, discovery render Portuguese with no English leakage / raw keys; interpolation (counts, names, countdowns) works.
4. **User review:** the agreed post-merge wording review (the quality gate).

## Out of scope (this slice)

`onboarding` (already complete); any non-mobile copy; changing `en` wording. New English-only keys added in future slices will be caught by the parity test.
