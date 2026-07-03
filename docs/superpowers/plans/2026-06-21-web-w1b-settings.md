# Web W1b — Settings Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web settings hub — index + notifications, change password, change email (OTP), delete account, support, language, logout — reusing `@padel/auth` + `@padel/api`.

**Architecture:** New routes under `apps/web/src/app/(app)/app/settings/`, three new shadcn primitives, a `settings` i18n namespace, and a Settings entry on the profile page. Sensitive flows reuse vetted `@padel/auth` helpers.

**Tech Stack:** Next.js App Router (client components), `@padel/auth`, `@padel/api` (react-query), shadcn/ui, react-i18next.

**Spec:** [docs/superpowers/specs/2026-06-21-web-w1b-settings-design.md](specs/2026-06-21-web-w1b-settings-design.md)

**Verified signatures (use exactly):**
- `changePassword(client, email, currentPassword, newPassword): Promise<{ ok: true } | { ok: false; reason: 'current_password_wrong' | 'update_failed' }>`
- `startEmailChange(client, newEmail)`; `verifyEmailChange(client, newEmail, token)` (verifyOtp type `email_change`)
- `signOut(client)`
- `useMySettings()` → `{ notifications_push, notifications_whatsapp, notifications_email }`; `useUpdateSettings().mutate(patch: Partial<{notifications_push,notifications_whatsapp,notifications_email}>)`
- `useCreateSupportTicket().mutate({ title, description })`; `useUpdateProfile().mutateAsync({ locale })`
- delete: `fetch(\`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account\`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:\`Bearer ${session.access_token}\` } })` then `signOut(supabase)`.

---

## Task 1: Foundations — shadcn primitives, i18n, profile entry

**Files:** add `apps/web/src/components/ui/{switch,alert-dialog,label}.tsx`; modify `apps/web/src/lib/i18n-web.ts`, `apps/web/src/components/Providers.tsx`, `apps/web/src/app/(app)/app/profile/page.tsx`.

- [ ] **Step 1:** From `apps/web`, with creds: `set -a; source .env.local; set +a; npx shadcn@latest add switch alert-dialog label --yes`. Confirm files land in `src/components/ui/`.
- [ ] **Step 2:** Add a `settings` namespace to `i18n-web.ts` (mirror `registerWebProfileCopy`) + export `registerWebSettingsCopy(instance)` registering namespace `'settings'`; call it in `Providers.tsx` after `registerWebProfileCopy`. English keys (translate pt-PT/pt-BR):
```
title:'Settings', account:'Account', preferences:'Preferences', support:'Support', legal:'Legal',
changeEmail:'Change email', changePassword:'Change password', notifications:'Notifications', language:'Language',
contactSupport:'Contact support', terms:'Terms of Use', privacy:'Privacy Policy', logout:'Log out',
deleteAccount:'Delete account',
notifPush:'Push notifications', notifWhatsapp:'WhatsApp', notifEmail:'Email',
currentPassword:'Current password', newPassword:'New password', confirmPassword:'Confirm password',
passwordTooShort:'Password must be at least 8 characters.', passwordsDontMatch:'Passwords do not match.',
currentPasswordWrong:'Current password is incorrect.', passwordChanged:'Password changed.', saveError:'Something went wrong. Please try again.',
newEmail:'New email', sendCode:'Send code', codeLabel:'6-digit code', codeSentTo:'We sent a code to {{email}}.',
emailInvalid:'Enter a valid email.', invalidCode:'Invalid or expired code.', emailChanged:'Email updated.',
deleteWarningTitle:'Delete your account?', deleteWarningBody:'This permanently erases your profile, memberships, social connections and messages. This cannot be undone.',
deleteConfirm:'Delete my account', deleteCancel:'Cancel',
supportTitle:'Title', supportDescription:'How can we help?', supportSend:'Send', supportSent:"Thanks — we'll respond within ~5 days.",
save:'Save', back:'Back'
```
- [ ] **Step 3:** On `/app/profile`, add a Settings link (e.g. a `Button asChild` with `<Link href="/app/settings">` near Edit).
- [ ] **Step 4:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/components/ui apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx "apps/web/src/app/(app)/app/profile/page.tsx" apps/web/package.json pnpm-lock.yaml apps/web/components.json && git commit -m "feat(web): settings primitives + i18n + profile entry (W1b)"`

---

## Task 2: Settings hub + notifications

**Files:** create `apps/web/src/app/(app)/app/settings/page.tsx`, `apps/web/src/app/(app)/app/settings/notifications/page.tsx`.

- [ ] **Step 1: Hub** `/app/settings` — client component. A grouped list (use `Card` + `Link` rows + `Separator`) with the sections from the spec. Each row links to its sub-route; Terms/Privacy are external `<a>` to `https://padeljam.app/terms` and `/privacy`. **Log out**: a destructive `Button` → `await signOut(supabase); router.replace('/auth')`. **Delete account**: a destructive row → `/app/settings/delete`. Include the **Language** `Select` inline here (see Task 4 Step 3 for its handler, or implement here): on change → `await useUpdateProfile().mutateAsync({ locale }); i18n.changeLanguage(locale)` (get `i18n` from `useTranslation()`); options en/pt-PT/pt-BR.
- [ ] **Step 2: Notifications** `/app/settings/notifications` — seed three `Switch`es from `useMySettings()`. On toggle, optimistic local state + `useUpdateSettings().mutate({ [key]: value })`; on error revert + inline `saveError`. Labels `notifPush`/`notifWhatsapp`/`notifEmail`.
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): settings hub + notifications (W1b)"`

---

## Task 3: Change password + change email

**Files:** create `apps/web/src/app/(app)/app/settings/password/page.tsx`, `apps/web/src/app/(app)/app/settings/email/page.tsx`.

- [ ] **Step 1: Password** — three password `Input`s. The user's email comes from `useMyProfile().data` (the `email` is on `auth.users`, but `useMyProfile` selects profile fields — get the email from `supabase.auth.getUser()` or `useSession().session?.user.email`). On submit: validate `newPassword.length >= 8` (`passwordTooShort`) and `new === confirm` (`passwordsDontMatch`); then `const r = await changePassword(supabase, email, current, next);` if `!r.ok` map `r.reason` → `currentPasswordWrong` / `saveError`; else show `passwordChanged` + `router.push('/app/settings')`.
- [ ] **Step 2: Email** — two-step. Step 1: new-email `Input` → validate format → `await startEmailChange(supabase, newEmail)` → advance to code step (`codeSentTo` with the email). Step 2: 6-digit `Input` → `const { error } = await verifyEmailChange(supabase, newEmail, code)`; on error `invalidCode`; on success `emailChanged` + `router.push('/app/settings')`.
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): change password + change email (W1b)"`

---

## Task 4: Delete account + support

**Files:** create `apps/web/src/app/(app)/app/settings/delete/page.tsx`, `apps/web/src/app/(app)/app/settings/support/page.tsx`.

- [ ] **Step 1: Delete** — warning text (`deleteWarningBody`) + an `AlertDialog` (trigger `deleteAccount`, confirm `deleteConfirm`, cancel `deleteCancel`). On confirm:
```ts
const { data: { session } } = await supabase.auth.getSession();
if (!session) return;
const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
});
if (!resp.ok) { setError(t('saveError')); return; }
await signOut(supabase);
router.replace('/auth');
```
- [ ] **Step 2: Support** — `Input` (title) + `Textarea` (description) → `useCreateSupportTicket().mutate({ title, description })`; on success show `supportSent` (clear the form / show a confirmation panel). Disable submit while pending or empty.
- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): delete account + support (W1b)"`

---

## Task 5: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; drive via headless Chrome.

- [ ] **Step 1:** `pnpm --filter web typecheck` && `build` → PASS.
- [ ] **Step 2:** Sign in → `/app/profile` → Settings → `/app/settings` renders all sections.
- [ ] **Step 3:** Notifications: toggle email on → reload → still on (persisted in `user_settings`).
- [ ] **Step 4:** Change password: wrong current → `currentPasswordWrong`; correct current + valid new → `passwordChanged`.
- [ ] **Step 5:** Change email: enter a new email → code arrives in Mailpit (`:55324`, `email_change` template) → enter it → `emailChanged`; confirm `auth.users.email` updated.
- [ ] **Step 6:** Support: submit → a `support_tickets` row inserted.
- [ ] **Step 7:** Language: switch to pt-PT → UI copy flips; Log out → `/auth`. (Delete-account: optionally verify with a throwaway user → signed out + row anonymized.)

---

## Verification (summary)
Per-task typecheck; build after Task 4; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
App icon (native-only); subscription (Phase 3); DOB/gender/mobile + phone-change account fields.
