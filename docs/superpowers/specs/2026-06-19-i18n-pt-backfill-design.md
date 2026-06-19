# PT-PT / PT-BR Translation Backfill (A5) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Complete the mobile i18n locale matrix: every namespace gets full `pt-PT` and `pt-BR` blocks matching its
`en` keys, so Portuguese users stop falling back to English. A parity test guards the change. Wording is
reviewed by the user after the slice lands.

## Context

`apps/mobile/lib/i18n-mobile.ts` holds 11 namespace consts, each shaped
`{ 'pt-PT': {...}, 'pt-BR': {...}, en: {...} } as const`. `registerMobileCopy(instance)` registers them into
i18next; `auth`/`onboarding`/`community` are registered for all three locales (a loop), while the other 8
namespaces are registered **English-only** (hard-coded `'en'`). i18next `fallbackLng: 'en'`, so missing PT keys
currently render in English (no broken keys today) — this slice is localization completeness, not a bug fix.

Coverage today (audit):

| Namespace | en keys | pt-PT | pt-BR | Gap |
|---|---|---|---|---|
| onboarding | 19 | full | full | none |
| community | ~200 | ~197 | ~197 | ~3 each |
| auth | ~52 | ~24 | ~24 | ~28 each |
| event | ~368 | — | — | all |
| profile | ~109 | — | — | all |
| group | ~95 | — | — | all |
| chat | ~27 | — | — | all |
| notifications | ~25 | — | — | all |
| home | ~23 | — | — | all |
| discovery | ~18 | — | — | all |
| events | ~6 | — | — | all |

Total ≈ 700 keys × 2 locales ≈ 1,400 translated strings. (Counts are approximate; the `en` block of each
namespace is the authoritative key list.)

## Scope decisions (from the brainstorm)

1. **Everything in one slice:** all 8 English-only namespaces + the auth/community partial gaps. `onboarding`
   is already complete.
2. **Both `pt-PT` and `pt-BR`.**
3. **I (assistant) draft idiomatic translations; the user reviews wording after the slice lands.** English
   fallback already covered the risk during the gap, so a post-merge review is acceptable.

## Translation rules (applied uniformly)

- **Key parity:** each PT block has **exactly the same keys** as its `en` block — none missing, none extra,
  identical key names (including `_one`/`_other` plural variants).
- **Placeholders preserved verbatim:** every `{{token}}` in a value (`{{actor}}`, `{{target}}`, `{{entity}}`,
  `{{count}}`, `{{seconds}}`, `{{identifier}}`, `{{name}}`, `{{average}}`, …) must appear unchanged in the
  translation. No translating, reordering-away, or dropping a token.
- **Proper nouns untranslated:** "Padel Jam" stays "Padel Jam".
- **Dialect:** translate idiomatically per variant — pt-PT and pt-BR differ (e.g. team → "equipa" (PT) vs
  "time" (BR); user → "utilizador" (PT) vs "usuário" (BR); "casa de banho"/"banheiro", etc.). Padel domain
  terms (americano, mexicano, court/"campo", standby) follow common Portuguese padel usage.
- **No structural/code changes** beyond adding the locale blocks and the `registerMobileCopy` loop.

## Architecture

### 1. Locale blocks (`apps/mobile/lib/i18n-mobile.ts`)

- For each of the 8 English-only namespaces (`mobileEvent`, `mobileProfile`, `mobileGroup`, `mobileChat`,
  `mobileNotifications`, `mobileHome`, `mobileDiscovery`, `mobileEvents`), add a `'pt-PT': { … }` and
  `'pt-BR': { … }` object with the same keys as `en`, translated per the rules.
- For `mobileAuth` and `mobileCommunity`, add the missing keys to the existing `pt-PT` and `pt-BR` blocks so
  they reach parity with `en`.

### 2. `registerMobileCopy`

Replace the hard-coded English-only registrations with a uniform loop registering all three locales for every
namespace, e.g.:
```ts
const NS = { auth: mobileAuth, onboarding: mobileOnboarding, community: mobileCommunity, group: mobileGroup,
  event: mobileEvent, discovery: mobileDiscovery, home: mobileHome, notifications: mobileNotifications,
  events: mobileEvents, profile: mobileProfile, chat: mobileChat } as const;
export function registerMobileCopy(instance: I18n): void {
  for (const [ns, blocks] of Object.entries(NS)) {
    (Object.keys(blocks) as MobileLocale[]).forEach((locale) => {
      instance.addResourceBundle(locale, ns, (blocks as Record<string, object>)[locale], true, false);
    });
  }
}
```
(Each namespace now has all three locale keys, so the loop is uniform. Keep the exact `addResourceBundle(...,
true, false)` deep-merge signature.)

### 3. Parity test (the guard)

Add a vitest — `apps/mobile/lib/i18n-mobile.test.ts` (or `packages/i18n` if that's where mobile tests live;
match the existing test setup) — importing the namespace consts and asserting, for **every** namespace:
- `Object.keys(ns['pt-PT']).sort()` deep-equals `Object.keys(ns.en).sort()` — and same for `pt-BR`. (Catches
  any missing/extra/misspelled key.)
- For every key, the set of `{{…}}` tokens in `ns['pt-PT'][key]` equals the set in `ns.en[key]` — and same for
  `pt-BR`. (Catches dropped/garbled interpolation.) Implement with a small regex `/\{\{\s*([\w]+)\s*\}\}/g`.

The consts may need a small `export` so the test can import them (export each `mobileX` const, or an aggregate
`MOBILE_NAMESPACES` map — reuse the `NS` map from §2 by exporting it). Prefer exporting the `NS` map and
iterating it in both `registerMobileCopy` and the test.

## Error handling

- The parity test is the safety net: a missing key or broken placeholder fails CI/local test rather than
  silently shipping English fallback or a `{{count}}`-less plural.
- i18next still falls back to `en` at runtime if anything slips through, so there is no raw-key exposure risk.

## Testing / verification

- **Parity test:** `pnpm --filter mobile test` (or the workspace test command that runs the mobile vitest) →
  the new i18n parity test passes for all 11 namespaces × 2 PT locales.
- **Types:** `pnpm -w typecheck` (13/13) — adding locale blocks + the loop must not break types.
- **App smoke (simulator):** set the device/profile locale to `pt-PT` (then `pt-BR`) → previously-English
  screens (event create/manage, profile, groups, chat, home, notifications, discovery) render Portuguese with
  no English leakage and no raw keys; placeholders interpolate (counts, names, countdowns).

## Execution shape (for the plan)

Decompose into **per-namespace tasks** (one subagent translates one namespace's two PT blocks), ordered
smallest→largest or grouped, then: a task for the auth + community gap fills, then a task for the
`registerMobileCopy` loop + the parity test. Run the parity test after each namespace task so a missing key is
caught immediately. The large `event` namespace may be split into sub-batches if needed.

## Conventions followed

No migration; pure i18n data + a registration refactor + a vitest. Keys/placeholders/plurals preserved exactly;
`as const` blocks; `registerMobileCopy` keeps its `addResourceBundle(…, true, false)` signature. Post-merge
user review of wording (the agreed quality gate). Proper nouns untranslated.
