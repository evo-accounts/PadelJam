# UX-GLOB-06 Submission Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every failed submit shows the pinned top banner. Auth screens show only the banner and keep their inputs neutral. Every other form shows the banner and turns the invalid inputs red.

**Architecture:** `useBanner` (foundations) is the response to the tap. A tiny `validate()` per form returns `{ ok, fieldErrors }`; on failure the screen calls `banner.show(t('missingInformation', { ns: 'common' }))` and, outside auth, sets `error` on the failing `Field`s. Raw `TextInput`s in non-auth forms migrate to `Field` so the red state exists. The inline summary `Text` under each form is removed where the banner and red fields replace it.

**Tech Stack:** react-native, the `Banner` and `Field` primitives, i18next.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 5. **Depends on:** the foundations PR merged.

**Prerequisites:** `git fetch origin && git checkout -b feat/ux-submission-feedback origin/main`.

---

## The two patterns

**Auth (banner only):**

```tsx
const banner = useBanner();
const { t: tc } = useT('common');
…
const onSubmit = async () => {
  if (!identifier.trim()) { banner.show(tc('missingInformation')); return; }   // never says which field
  try { await startOtp(identifier); router.push(…); }
  catch (e) { banner.show(t(safeAuthMessage(e))); }                          // generic unless safe
};
```
`safeAuthMessage(e)` lives in `apps/mobile/lib/authErrors.ts`: maps a known, non-enumerating error (`invalid_code`, `expired_code`, `network`, `rate_limited`) to its i18n key in the `auth` namespace, and everything else to `somethingWrong` in `common`. Nothing on these screens may reveal whether an identifier exists.

**Other forms (banner + red inputs):**

```tsx
const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'location', string>>>({});
…
const onSave = async () => {
  const errors = validate({ name, location });          // pure, per screen
  if (Object.keys(errors).length) {
    setFieldErrors(errors);
    banner.show(tc('missingInformation'));
    return;
  }
  setFieldErrors({});
  try { await save(); banner.show(t('saved'), 'success'); router.back(); }
  catch (e) { banner.show(t(mapPgError(e) ?? 'unknown_error')); }
};
…
<Field label={t('nameLabel')} value={name} onChangeText={setName} error={fieldErrors.name} required />
```
`error` on `Field` reddens the border and shows the message under the input; the message can be the field's own hint of what is required (e.g. `t('required')` from `common`, add it: "Required" / "Obrigatório" / "Obrigatório").

---

### Task 1: `authErrors` and `required` copy

**Files:**
- Create: `apps/mobile/lib/authErrors.ts`, `apps/mobile/lib/authErrors.test.ts`
- Modify: `packages/i18n/src/resources/*/common.json` (add `required`)

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { safeAuthMessage } from './authErrors';

describe('safeAuthMessage', () => {
  it('passes through safe, non-enumerating codes', () => {
    expect(safeAuthMessage(new Error('invalid_code'))).toEqual({ ns: 'auth', key: 'invalidCode' });
    expect(safeAuthMessage(new Error('Token has expired or is invalid'))).toEqual({ ns: 'auth', key: 'invalidCode' });
  });
  it('hides everything that could confirm an identifier exists', () => {
    expect(safeAuthMessage(new Error('User not found'))).toEqual({ ns: 'common', key: 'somethingWrong' });
    expect(safeAuthMessage(new Error('Invalid login credentials'))).toEqual({ ns: 'common', key: 'somethingWrong' });
    expect(safeAuthMessage(null)).toEqual({ ns: 'common', key: 'somethingWrong' });
  });
  it('names network and rate-limit problems', () => {
    expect(safeAuthMessage(new Error('Network request failed'))).toEqual({ ns: 'auth', key: 'networkError' });
    expect(safeAuthMessage(new Error('over_email_send_rate_limit'))).toEqual({ ns: 'auth', key: 'rateLimited' });
  });
});
```
- [ ] **Step 2: Implement**
```ts
// apps/mobile/lib/authErrors.ts
export type SafeMessage = { ns: 'auth' | 'common'; key: string };
const SAFE: Array<[RegExp, SafeMessage]> = [
  [/invalid_code|expired|otp/i, { ns: 'auth', key: 'invalidCode' }],
  [/network|fetch failed|timed? ?out/i, { ns: 'auth', key: 'networkError' }],
  [/rate.?limit/i, { ns: 'auth', key: 'rateLimited' }],
];
/** Auth screens may name a code problem or a network problem, never whether an account exists. */
export function safeAuthMessage(e: unknown): SafeMessage {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  for (const [re, m] of SAFE) if (re.test(msg)) return m;
  return { ns: 'common', key: 'somethingWrong' };
}
```
Ensure `invalidCode`, `networkError`, `rateLimited` exist in the `auth` namespace (`packages/i18n/src/resources/*/auth.json` or `mobileAuth`); add them if absent, three locales.
- [ ] **Step 3:** Run the test → 3 passed. `pnpm i18n:check`. Commit `feat(mobile): safe auth error mapping and required copy`.

---

### Task 2: Auth screens, banner only

**Files:** `app/(auth)/sign-in.tsx:105`, `otp.tsx:154-155`, `create-account.tsx:104,111,259-260,357`, `password.tsx:68,70`, `recovery.tsx:126,145`, `app/profile/change-email.tsx:63,71`, `app/profile/change-password.tsx:54`.

- [ ] **Step 1:** In each, replace `setError(code)` + the inline `<Text style={styles.error}>` with `banner.show(...)` per the auth pattern; delete the `error` state and style. `create-account.tsx:104,111` currently `return`s silently when name / identifier / password / terms are missing: replace with `banner.show(tc('missingInformation')); return;`. Keep the submit buttons enabled so the tap always gets a banner (remove `disabled={!canSubmit}` where it existed for validation reasons; keep `loading`).
- [ ] **Step 2:** E2E suite 01 asserts the old inline error strings on the OTP screen (wrong code) — update those assertions to read the banner text (`expectVisible(/invalid code/i)` still works since the banner text is in the tree). Run `pnpm --filter mobile e2e -- --suite 01`.
- [ ] **Step 3:** Commit `feat(mobile): auth screens answer a failed tap with the banner only`.

---

### Task 3: Forms, banner plus red inputs

**Files:** `app/profile/edit.tsx:135`, `app/(tabs)/community/create.tsx:168`, `app/community/[id]/manage/settings.tsx:217`, `app/community/[id]/group-create.tsx` + `components/community/GroupComposer.tsx:137,150,151`, `app/group/[id]/manage/settings.tsx`, `app/community/[id]/reviews/write.tsx:95`, `app/event/create/index.tsx:165-169`, `app/event/[id]/edit.tsx:201`, `app/event/[id]/blast.tsx:124,237`, `app/community/[id]/compose.tsx`, `app/profile/support.tsx:43`.

- [ ] **Step 1:** For each, write a `validate(values)` returning `Partial<Record<Field, string>>` next to the screen (or in `GroupComposer` for the two group forms), migrate raw `TextInput`s to `Field`, wire `error={fieldErrors.x}`, and apply the form pattern. The event wizard: `canAdvance` stays as the gate for Next, but a tap on a disabled Next currently does nothing; make Next always enabled and, when `!canAdvance`, show the banner and mark the step's failing fields (each step's `isValid(draft)` is extended to also return the failing field keys: `isValid(draft): boolean` becomes `validate(draft): string[]` with `isValid = validate(draft).length === 0`, so existing callers keep working).
- [ ] **Step 2:** Commits per directory; `pnpm i18n:check` after each.

---

### Task 4: Verification and PR

- [ ] `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`; `grep -rn "styles.error" apps/mobile/app` → only non-form uses remain (report).
- [ ] E2E: suites 01 (auth), 05 (wizard), 09/10 (community/group forms).
- [ ] Simulator: submit every form empty — a banner appears at the top regardless of scroll; auth inputs stay neutral; other forms show red inputs.
- [ ] PR `feat/ux-submission-feedback` → main, spec section 5. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
