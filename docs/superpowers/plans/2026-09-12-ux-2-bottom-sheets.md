# UX-GLOB-02 Bottom Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every overflow menu, confirmation and selector in the mobile app uses the `BottomSheet` primitive (or the `useConfirm` / `useActionSheet` hooks over it). No `Alert.alert`, no centred modal, no dropdown, no native action sheet remains for those purposes.

**Architecture:** Three mechanical replacements. Two-button `Alert.alert` → `await confirm(...)`. Menu-style `Alert.alert`, dropdowns and centred menus → `await show(...)`. Custom modals that carry content (pickers, block/report forms, score entry) → `BottomSheet` with their content as children. Success toasts sent through `Alert.alert` → `useBanner` with the `success` tone.

**Tech Stack:** react-native, the foundations primitives (`BottomSheet`, `SheetRow`, `useConfirm`, `useActionSheet`, `useBanner`).

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 2. **Depends on:** the foundations PR merged.

**Prerequisites:** `git fetch origin && git checkout -b feat/ux-bottom-sheets origin/main`. Checks: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm i18n:check && pnpm --filter mobile test`.

---

## The three patterns

**Confirmation** (was a two-button `Alert.alert`):

```tsx
// before
Alert.alert(t('archiveCta'), t('archiveConfirm'), [
  { text: t('cancel'), style: 'cancel' },
  { text: t('archiveCta'), style: 'destructive', onPress: async () => { await archive.mutateAsync(…); } },
]);

// after
const confirm = useConfirm();
…
if (await confirm({ title: t('archiveCta'), body: t('archiveConfirm'), confirmLabel: t('archiveCta'), cancelLabel: t('cancel'), destructive: true })) {
  await archive.mutateAsync(…);
}
```

**Menu** (was an `Alert.alert` with several buttons, a centred `Modal`, or an inline dropdown):

```tsx
const show = useActionSheet();
…
const key = await show({
  title: member.full_name,
  actions: [
    { key: 'message', label: t('message') },
    { key: 'remove', label: t('removeMember'), destructive: true },   // confirmed by the host
  ],
});
if (key === 'message') …; if (key === 'remove') …;
```

**Content sheet** (a modal that shows a form or a list to pick from):

```tsx
<BottomSheet visible={open} onClose={() => setOpen(false)} title={t('addAdminTitle')} testID="add-admin-sheet">
  {candidates.map((c) => (
    <SheetRow key={c.id} label={c.full_name} leading={<Avatar name={c.full_name} uri={c.avatar_url} colourKey={c.id} size="sm" />} onPress={() => pick(c.id)} />
  ))}
</BottomSheet>
```

**Success message** (was `Alert.alert(t('sentTitle'), t('sentBody'))`): `useBanner().show(t('sentBody'), 'success')`.

Error messages that were `Alert.alert(t('errorTitle'), t(code))` become `useBanner().show(t(code))` (the submission-feedback plan covers forms; this plan covers the ad-hoc ones in the files below so no `Alert` import survives).

---

### Task 1: Confirmations (the 48 `Alert.alert` calls)

**Files (20):** convert every `Alert.alert` in each file to one of the patterns above, then delete the `Alert` import.

| File | Calls | Kind |
|---|---|---|
| `app/community/[id]/manage/index.tsx` | 7 | confirmations (archive/unarchive, leave, transfer) + 1 success |
| `app/event/[id]/manage.tsx` | 7 | confirmations (remove player: two options → **menu** with `to_invited` / `from_event` keys), export **menu** (`:183`), cancel event (recurring: menu of `only_this` / `this_and_upcoming`) |
| `app/group/[id]/manage/seasons.tsx` | 5 | confirmations (start season, archive, unarchive) + errors → banner |
| `app/community/[id]/manage/invite.tsx` | 4 | success → banner; errors → banner |
| `app/group/[id]/index.tsx` | 3 | ••• **menu** (`:169`), leave confirm, error → banner |
| `app/group/[id]/invite.tsx` | 3 | confirm + errors |
| `app/community/[id]/manage/members.tsx` | 3 | member overflow **menu** (`:90`), remove confirm |
| `app/group/[id]/manage/members.tsx` | 2 | confirms |
| `app/(tabs)/community/index.tsx` | 2 | confirms |
| `components/event/TeamManage.tsx` | 2 | slot actions **menu** (`:103`), remove confirm |
| `app/profile/support.tsx` | 1 | success → banner |
| `app/profile/change-password.tsx` | 1 | success → banner |
| `app/profile/change-email.tsx` | 1 | success → banner |
| `app/profile/delete-account.tsx` | 1 | destructive confirm |
| `app/community/[id]/join.tsx` | 1 | confirm |
| `app/community/[id]/manage/requests.tsx` | 1 | decline confirm |
| `app/community/[id]/manage/permissions.tsx` | 1 | error → banner |
| `app/event/create/index.tsx` | 1 | already converted in the foundations plan; verify no `Alert` remains |
| `app/notifications/partner-requests.tsx` | 1 | decline confirm |
| `components/chat/ChannelRow.tsx` | 1 | see Task 2 (its menu and confirm are the centred modal) |

- [ ] **Step 1: Convert per file** (one commit per top-level directory: `community`, `event`, `group`, `profile`, `(tabs)`, `components`). Keep every i18n key; menus reuse the button labels that were in the alert.
- [ ] **Step 2: Prove nothing survived**: `grep -rn "Alert.alert\|from 'react-native'.*Alert" apps/mobile/app apps/mobile/components` → no hits (the only allowed `Alert` use is none).
- [ ] **Step 3: Checks and commits.**

---

### Task 2: Centred modals and dropdowns

**Files:**
- `components/chat/ChannelRow.tsx:136` — the ••• channel menu and its delete confirm: `useActionSheet` with `archive`/`unarchive`/`delete` (delete destructive → auto-confirmed). Remove the `Modal`.
- `components/profile/BlockReportModals.tsx:73` — block confirm → `useConfirm`; the report form (reason chips + text) → `BottomSheet` with the form as children and a full-width submit `Button`.
- `components/profile/ProfileView.tsx:80-92` — the inline ••• dropdown → `useActionSheet` (block / report / share).
- `components/event/TeamManage.tsx:318` — the confirm modal → `useConfirm`; the assign/switch pickers at `:317` are already bottom-anchored: move them onto `BottomSheet` with `SheetRow`s (Task 3).
- `app/group/[id]/index.tsx:386` — add-admin picker → `BottomSheet` + `SheetRow` with avatars.
- `app/event/[id]/live.tsx:828` — score entry → `BottomSheet` titled with the match, children = the two score inputs and a submit button (keep the inputs; only the container changes).

- [ ] **Step 1: Convert each**, keeping `testID`s the E2E suites use (grep `apps/mobile/e2e/suites` for each file's testIDs before changing them).
- [ ] **Step 2: Checks and commit** `refactor(mobile): centred menus and pickers become bottom sheets`.

---

### Task 3: Bottom-anchored modals onto the primitive

**Files:** `components/event/ShareResultsModal.tsx:93`, `components/event/TeamManage.tsx:317` (assign + switch), `components/community/RulesModal.tsx:34`, `app/(auth)/otp.tsx:232` (the "try another way" sheet), `app/event/[id]/blast.tsx:279`, `app/community/[id]/manage/index.tsx:278`.

- [ ] **Step 1: Replace each hand-rolled `Modal` + backdrop + sheet `View` with `<BottomSheet visible onClose title>` and keep the children.** Delete the local `backdrop`/`sheet` styles. The ✕ comes from the primitive; remove any in-sheet "Close" row or button.
- [ ] **Step 2: Checks and commit** `refactor(mobile): existing bottom sheets use the BottomSheet primitive`.

---

### Task 4: Selectors

**Files:** `app/profile/settings.tsx:57-65` (language: the inline `Chip` row becomes a `ListRow` "Language · English" that opens a `BottomSheet` of `SheetRow`s, current one marked with a `Badge`); `app/community/[id]/manage/index.tsx:183` (transfer-ownership picker → `BottomSheet` with avatar rows); `components/community/CommunitySwitcher.tsx` (if it is a dropdown/modal today, move it onto `BottomSheet`; if it is an inline horizontal switcher in the page, leave it: it is layout, not a selector overlay).

Form widgets (`SelectableCard`, `Chip` groups, `SegmentedType`, `PrivacyCards`, `ChoiceRow`) stay: they are part of the form's layout.

- [ ] **Step 1: Convert; add `languageSheetTitle` to the profile namespace in three locales.**
- [ ] **Step 2: Checks and commit** `feat(mobile): selectors open as bottom sheets`.

---

### Task 5: Verification and PR

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`; `grep -rn "Alert\b" apps/mobile/app apps/mobile/components --include=*.tsx | grep -v "accessibilityRole=\"alert\"" ` → empty.
- [ ] **Step 2:** E2E suites 04, 09, 10, 11, 12, 13 (they drive manage screens, group menus, chat rows, notifications).
- [ ] **Step 3:** Simulator walk: group •••, member •••, chat row •••, profile •••, delete account, cancel event, export roster, language picker — each is a sheet anchored to the bottom with a ✕, and every destructive action asks first.
- [ ] **Step 4:** PR `feat/ux-bottom-sheets` → main, spec section 2, with the before/after counts (48 alerts, 18 modals, 1 dropdown → 0). End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
