# UX Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four primitives every UX global rule depends on: a bottom sheet with `useConfirm` and `useActionSheet`, a top `Banner`, `TopBar` variants, and an `Avatar` whose initials are legible on a coloured background; prove each on one existing screen.

**Architecture:** All primitives live in `apps/mobile/components/ui` and take colours, radii, spacing and type only from `apps/mobile/theme`. The sheet hooks resolve promises so call sites read like the `Alert.alert` calls they replace; a single host component per hook is mounted once in the root layout. The banner is a provider with one mounted view pinned above the navigator. `TopBar` keeps its fixed side slots and gains a `variant`. The logic that can be unit-tested (a promise queue, the avatar palette, banner timing) is isolated from rendering; rendering is proven through the Storybook gallery and E2E suite 00, which is how this app tests primitives.

**Tech Stack:** react-native 0.85 (`Modal`, `Pressable`, `AccessibilityInfo`), expo-router, expo-symbols (`SymbolView`), vitest (node env for pure logic, jsdom for hooks as in `StreamChatProvider.test.tsx`), i18next (`packages/i18n` `common` namespace), the on-device Storybook gallery `apps/mobile/components/ui/Gallery.stories.tsx` and E2E suite `apps/mobile/e2e/suites/00-design-system.e2e.ts`.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 0.

**Prerequisites:** Branch: `git fetch origin && git checkout -b feat/ux-foundations origin/main`. `pnpm install`. Checks used throughout: `pnpm --filter mobile test`, `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, `pnpm i18n:check`. The lint config forbids raw colours outside `apps/mobile/theme` and requires a label on glyph-only pressables.

**Conventions to respect:** `IconButton` requires `accessibilityLabel`; `Text` variants are `display | title | heading | sectionTitle | body | bodyStrong | label | caption | hint` and tones `default | muted | subtle | inverse | primary | destructive | success`; `colors.overlay`, `colors.card`, `colors.border`, `colors.destructive`, `colors.successStrong` exist; `radius.xl` = 14, `radius['2xl']` = 16, `space[n]` steps; the E2E driver finds controls by accessibility label, so every control carries a real label.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/mobile/components/ui/BottomSheet.tsx` | The anchored sheet: backdrop, ✕, title, children. Presentational only. |
| `apps/mobile/components/ui/SheetRow.tsx` | One full-width action row inside a sheet (uses `ListRow`). |
| `apps/mobile/components/ui/sheetQueue.ts` | Pure promise queue used by both hooks; unit-tested. |
| `apps/mobile/components/ui/SheetHost.tsx` | Context + one mounted host that renders the current confirm or action-sheet request; exports `useConfirm`, `useActionSheet`. |
| `apps/mobile/components/ui/Banner.tsx` | `BannerProvider`, `useBanner`, the pinned view. |
| `apps/mobile/components/ui/bannerTimer.ts` | Pure auto-dismiss timing; unit-tested. |
| `apps/mobile/components/ui/TopBar.tsx` | Gains `variant`, `actions[]`, `onClose`, `dirty`. |
| `apps/mobile/components/ui/avatarColour.ts` | Deterministic palette pick per id; unit-tested for contrast. |
| `apps/mobile/components/ui/Avatar.tsx` | Uses the palette and the `inverse` tone. |
| `apps/mobile/components/ui/index.ts` | Exports. |
| `packages/i18n/src/resources/{en,pt-PT,pt-BR}/common.json` | Shared strings: back, close, cancel, confirm, discard copy, banner messages. |
| `apps/mobile/app/_layout.tsx` | Mounts `BannerProvider` and `SheetHost`. |
| `apps/mobile/components/event/PendingActionsSheet.tsx` | First `BottomSheet` consumer. |
| `apps/mobile/app/notifications/index.tsx` | First `useActionSheet` + destructive confirm consumer. |
| `apps/mobile/app/event/create/index.tsx` | First `useConfirm` consumer (discard). |
| `apps/mobile/components/ui/Gallery.stories.tsx` | Gallery sections for the new primitives and variants. |
| `apps/mobile/e2e/suites/00-design-system.e2e.ts` | Tree assertions for the new sections. |

---

### Task 1: Shared common strings

**Files:**
- Modify: `packages/i18n/src/resources/en/common.json`
- Modify: `packages/i18n/src/resources/pt-PT/common.json`
- Modify: `packages/i18n/src/resources/pt-BR/common.json`

- [ ] **Step 1: Write the three files**

`en/common.json`:
```json
{
  "appName": "Padel Jam",
  "back": "Back",
  "close": "Close",
  "cancel": "Cancel",
  "confirm": "Confirm",
  "discardTitle": "Discard changes?",
  "discardBody": "What you entered will be lost.",
  "discardConfirm": "Discard",
  "missingInformation": "Missing information",
  "somethingWrong": "Something isn't right"
}
```

`pt-PT/common.json`:
```json
{
  "appName": "Padel Jam",
  "back": "Voltar",
  "close": "Fechar",
  "cancel": "Cancelar",
  "confirm": "Confirmar",
  "discardTitle": "Descartar alterações?",
  "discardBody": "O que escreveste vai perder-se.",
  "discardConfirm": "Descartar",
  "missingInformation": "Falta informação",
  "somethingWrong": "Algo não está certo"
}
```

`pt-BR/common.json`:
```json
{
  "appName": "Padel Jam",
  "back": "Voltar",
  "close": "Fechar",
  "cancel": "Cancelar",
  "confirm": "Confirmar",
  "discardTitle": "Descartar alterações?",
  "discardBody": "O que você digitou será perdido.",
  "discardConfirm": "Descartar",
  "missingInformation": "Falta informação",
  "somethingWrong": "Algo não está certo"
}
```

- [ ] **Step 2: Check the catalogue loads**

Run: `pnpm i18n:check`
Expected: `ok — every literal key resolves in every locale` (no consumer yet, so nothing else changes).

- [ ] **Step 3: Commit**

```bash
git add packages/i18n/src/resources
git commit -m "feat(i18n): shared back/close/discard/banner strings in common"
```

---

### Task 2: Pure sheet queue with tests

**Files:**
- Create: `apps/mobile/components/ui/sheetQueue.ts`
- Create: `apps/mobile/components/ui/sheetQueue.test.ts`

The hooks need one thing that is easy to get wrong: a request opens, exactly one resolution wins, a new request while one is open resolves the old one as dismissed. That logic lives here, with no React.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/components/ui/sheetQueue.test.ts
import { describe, expect, it } from 'vitest';
import { SheetQueue } from './sheetQueue';

describe('SheetQueue', () => {
  it('opens a request and resolves it with the chosen value', async () => {
    const q = new SheetQueue<string>();
    const seen: Array<{ id: number; payload: string } | null> = [];
    q.subscribe((r) => seen.push(r));
    const p = q.open('confirm?');
    expect(seen.at(-1)).toEqual({ id: 1, payload: 'confirm?' });
    q.resolve(1, 'yes');
    await expect(p).resolves.toBe('yes');
    expect(seen.at(-1)).toBeNull();
  });

  it('dismisses the open request when a new one arrives', async () => {
    const q = new SheetQueue<string>();
    const first = q.open('a');
    const second = q.open('b');
    await expect(first).resolves.toBeNull();
    q.resolve(2, 'picked');
    await expect(second).resolves.toBe('picked');
  });

  it('ignores a resolution for a request that is no longer open', async () => {
    const q = new SheetQueue<string>();
    const p = q.open('a');
    q.resolve(1, 'x');
    q.resolve(1, 'y'); // stale, must not throw or change anything
    await expect(p).resolves.toBe('x');
    expect(q.current()).toBeNull();
  });

  it('dismiss resolves with null', async () => {
    const q = new SheetQueue<string>();
    const p = q.open('a');
    q.dismiss(1);
    await expect(p).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- sheetQueue`
Expected: fails, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/components/ui/sheetQueue.ts
/**
 * One open request at a time; each resolves exactly once. Opening a new request while one is
 * open dismisses the old one (resolves null), which is what a user expects when a second sheet
 * is summoned over the first. Pure so it can be tested without React.
 */
export type SheetRequest<P> = { id: number; payload: P };

export class SheetQueue<P, R = string | null> {
  private nextId = 1;
  private open_: { id: number; payload: P; resolve: (v: R | null) => void } | null = null;
  private listeners = new Set<(r: SheetRequest<P> | null) => void>();

  subscribe(fn: (r: SheetRequest<P> | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  current(): SheetRequest<P> | null {
    return this.open_ ? { id: this.open_.id, payload: this.open_.payload } : null;
  }

  open(payload: P): Promise<R | null> {
    if (this.open_) this.open_.resolve(null);
    const id = this.nextId++;
    return new Promise<R | null>((resolve) => {
      this.open_ = { id, payload, resolve };
      this.emit();
    });
  }

  resolve(id: number, value: R): void {
    if (!this.open_ || this.open_.id !== id) return;
    const { resolve } = this.open_;
    this.open_ = null;
    this.emit();
    resolve(value);
  }

  dismiss(id: number): void {
    if (!this.open_ || this.open_.id !== id) return;
    const { resolve } = this.open_;
    this.open_ = null;
    this.emit();
    resolve(null);
  }

  private emit() {
    const snapshot = this.current();
    for (const fn of this.listeners) fn(snapshot);
  }
}
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `pnpm --filter mobile test -- sheetQueue`
Expected: 4 passed.

```bash
git add apps/mobile/components/ui/sheetQueue.ts apps/mobile/components/ui/sheetQueue.test.ts
git commit -m "feat(ui): promise queue for sheet requests"
```

---

### Task 3: BottomSheet and SheetRow

**Files:**
- Create: `apps/mobile/components/ui/BottomSheet.tsx`
- Create: `apps/mobile/components/ui/SheetRow.tsx`
- Modify: `apps/mobile/components/ui/index.ts`

- [ ] **Step 1: Write BottomSheet**

```tsx
// apps/mobile/components/ui/BottomSheet.tsx
/**
 * BottomSheet — the ONE way this app presents an overflow menu, a confirmation or a selector
 * (UX-GLOB-02). Anchored to the bottom, ✕ top-right, optional title, children stacked full width.
 *
 * Accessibility shape, learned from PendingActionsSheet: the backdrop is `accessible={false}` so
 * VoiceOver does not collapse the modal into one element; the sheet is a View with
 * `accessibilityViewIsModal` that claims the responder so taps inside never reach the backdrop.
 */
import { useT } from '@padel/i18n';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

export function BottomSheet({ visible, onClose, title, children, style, testID }: Props) {
  const { t } = useT('common');
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <View
          testID={testID}
          style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }, style]}
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.header}>
            {title ? (
              <Text variant="sectionTitle" tone="default" style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            ) : (
              <View style={styles.title} />
            )}
            <IconButton icon="✕" accessibilityLabel={t('close')} size="md" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
          </View>
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space[3],
    paddingHorizontal: space[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], marginBottom: space[2] },
  title: { flex: 1 },
});
```

- [ ] **Step 2: Write SheetRow**

```tsx
// apps/mobile/components/ui/SheetRow.tsx
/**
 * SheetRow — one action inside a BottomSheet. A ListRow with the destructive tone wired in, so
 * every sheet's rows look the same and destructive ones read as such.
 */
import type { ReactNode } from 'react';

import { ListRow } from './ListRow';

type Props = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  testID?: string;
};

export function SheetRow({ label, onPress, destructive = false, disabled = false, leading, testID }: Props) {
  return (
    <ListRow
      title={label}
      titleTone={destructive ? 'destructive' : 'default'}
      leading={leading}
      onPress={disabled ? undefined : onPress}
      testID={testID}
    />
  );
}
```

`ListRow` already supports `titleTone: 'default' | 'destructive'` (see `apps/mobile/components/ui/ListRow.tsx` around line 51). If a disabled row needs a visual state, pass `style={{ opacity: 0.45 }}` when `disabled`; `ListRow` accepts `style`.

- [ ] **Step 3: Export**

Add to `apps/mobile/components/ui/index.ts`:
```ts
export { BottomSheet } from './BottomSheet';
export { SheetRow } from './SheetRow';
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint`
Expected: clean (the ✕ glyph is on an `IconButton` with a label, so the glyph rule passes).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/BottomSheet.tsx apps/mobile/components/ui/SheetRow.tsx apps/mobile/components/ui/index.ts
git commit -m "feat(ui): BottomSheet and SheetRow primitives"
```

---

### Task 4: SheetHost with useConfirm and useActionSheet

**Files:**
- Create: `apps/mobile/components/ui/SheetHost.tsx`
- Modify: `apps/mobile/components/ui/index.ts`
- Modify: `apps/mobile/app/_layout.tsx` (mount the host inside the providers)

- [ ] **Step 1: Write the host and hooks**

```tsx
// apps/mobile/components/ui/SheetHost.tsx
/**
 * One host renders whichever confirm / action-sheet request is open. Call sites use the hooks:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: t('deleteTitle'), body: t('deleteBody'), confirmLabel: t('delete'), destructive: true })) { … }
 *
 *   const show = useActionSheet();
 *   const key = await show({ title: name, actions: [{ key: 'remove', label: t('remove'), destructive: true }] });
 *
 * Destructive rows in an action sheet are confirmed automatically before their key is returned,
 * so a call site cannot forget the confirmation the UX rule requires.
 */
import { useT } from '@padel/i18n';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { SheetRow } from './SheetRow';
import { SheetQueue, type SheetRequest } from './sheetQueue';
import { Text } from './Text';

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type SheetAction = { key: string; label: string; destructive?: boolean; disabled?: boolean };
export type ActionSheetOptions = { title?: string; actions: SheetAction[] };

type Request =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'actions'; options: ActionSheetOptions };

type Ctx = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  show: (o: ActionSheetOptions) => Promise<string | null>;
};

const SheetContext = createContext<Ctx | null>(null);

export function SheetHost({ children }: { children: ReactNode }) {
  const { t } = useT('common');
  const queue = useMemo(() => new SheetQueue<Request, string>(), []);
  const [current, setCurrent] = useState<SheetRequest<Request> | null>(null);

  useEffect(() => queue.subscribe(setCurrent), [queue]);

  const ctx = useMemo<Ctx>(
    () => ({
      confirm: async (options) => (await queue.open({ kind: 'confirm', options })) === 'confirm',
      show: async (options) => {
        const key = await queue.open({ kind: 'actions', options });
        if (key == null) return null;
        const action = options.actions.find((a) => a.key === key);
        if (action?.destructive) {
          const ok = (await queue.open({
            kind: 'confirm',
            options: { title: action.label, confirmLabel: action.label, destructive: true },
          })) === 'confirm';
          return ok ? key : null;
        }
        return key;
      },
    }),
    [queue],
  );

  const req = current;
  return (
    <SheetContext.Provider value={ctx}>
      {children}
      {req?.payload.kind === 'confirm' ? (
        <BottomSheet
          visible
          onClose={() => queue.dismiss(req.id)}
          title={req.payload.options.title}
          testID="confirm-sheet"
        >
          {req.payload.options.body ? (
            <Text variant="body" tone="muted" style={styles.body}>
              {req.payload.options.body}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button
              label={req.payload.options.confirmLabel}
              variant={req.payload.options.destructive ? 'destructive' : 'primary'}
              fullWidth
              onPress={() => queue.resolve(req.id, 'confirm')}
              testID="confirm-sheet-confirm"
            />
            <Button
              label={req.payload.options.cancelLabel ?? t('cancel')}
              variant="ghost"
              fullWidth
              onPress={() => queue.dismiss(req.id)}
              testID="confirm-sheet-cancel"
            />
          </View>
        </BottomSheet>
      ) : null}
      {req?.payload.kind === 'actions' ? (
        <BottomSheet
          visible
          onClose={() => queue.dismiss(req.id)}
          title={req.payload.options.title}
          testID="action-sheet"
        >
          {req.payload.options.actions.map((a) => (
            <SheetRow
              key={a.key}
              label={a.label}
              destructive={a.destructive}
              disabled={a.disabled}
              onPress={() => queue.resolve(req.id, a.key)}
              testID={`action-sheet-${a.key}`}
            />
          ))}
        </BottomSheet>
      ) : null}
    </SheetContext.Provider>
  );
}

export function useConfirm(): Ctx['confirm'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useConfirm needs SheetHost above it');
  return ctx.confirm;
}

export function useActionSheet(): Ctx['show'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useActionSheet needs SheetHost above it');
  return ctx.show;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[2], marginBottom: space[4] },
  buttons: { gap: space[2], paddingHorizontal: space[2] },
});
```

Check `Button`'s `ButtonVariant` union in `apps/mobile/components/ui/Button.tsx`. If there is no `destructive` variant, add one there in the `variants` record: `destructive: { bg: colors.destructive, border: colors.destructive, tone: 'inverse' }` and include it in the `ButtonVariant` type.

- [ ] **Step 2: Export and mount**

`apps/mobile/components/ui/index.ts`:
```ts
export { SheetHost, useConfirm, useActionSheet, type ConfirmOptions, type ActionSheetOptions, type SheetAction } from './SheetHost';
```

`apps/mobile/app/_layout.tsx`, in `RootLayout`'s return, wrap `<Boot />`:
```tsx
            <StreamChatProvider>
              <SheetHost>
                <Boot />
              </SheetHost>
            </StreamChatProvider>
```
with `import { SheetHost } from '@/components/ui';` (check how other `@/components` imports are written in that file and match).

- [ ] **Step 3: Typecheck and lint, commit**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint`

```bash
git add apps/mobile/components/ui/SheetHost.tsx apps/mobile/components/ui/index.ts apps/mobile/app/_layout.tsx apps/mobile/components/ui/Button.tsx
git commit -m "feat(ui): SheetHost with useConfirm and useActionSheet"
```

---

### Task 5: Banner with a tested timer

**Files:**
- Create: `apps/mobile/components/ui/bannerTimer.ts`
- Create: `apps/mobile/components/ui/bannerTimer.test.ts`
- Create: `apps/mobile/components/ui/Banner.tsx`
- Modify: `apps/mobile/components/ui/index.ts`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Failing timer test**

```ts
// apps/mobile/components/ui/bannerTimer.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BannerTimer } from './bannerTimer';

describe('BannerTimer', () => {
  it('shows a message and hides it after the timeout', () => {
    vi.useFakeTimers();
    const seen: Array<{ message: string; tone: 'error' | 'success' } | null> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('Missing information', 'error');
    expect(seen.at(-1)).toEqual({ message: 'Missing information', tone: 'error' });
    vi.advanceTimersByTime(3999);
    expect(seen.at(-1)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(seen.at(-1)).toBeNull();
    vi.useRealTimers();
  });

  it('a new message restarts the timeout', () => {
    vi.useFakeTimers();
    const seen: Array<unknown> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('a', 'error');
    vi.advanceTimersByTime(3000);
    timer.show('b', 'success');
    vi.advanceTimersByTime(3000);
    expect(seen.at(-1)).toEqual({ message: 'b', tone: 'success' });
    vi.advanceTimersByTime(1000);
    expect(seen.at(-1)).toBeNull();
    vi.useRealTimers();
  });

  it('touch dismisses immediately', () => {
    vi.useFakeTimers();
    const seen: Array<unknown> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('a', 'error');
    timer.dismiss();
    expect(seen.at(-1)).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(seen.filter((s) => s === null)).toHaveLength(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- bannerTimer`

- [ ] **Step 3: Implement the timer**

```ts
// apps/mobile/components/ui/bannerTimer.ts
export type BannerState = { message: string; tone: 'error' | 'success' } | null;

/** Holds one banner at a time; auto-hides after `ms`, or on dismiss(). Pure, no React. */
export class BannerTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(private ms: number, private onChange: (s: BannerState) => void) {}

  show(message: string, tone: 'error' | 'success'): void {
    this.clear();
    this.onChange({ message, tone });
    this.handle = setTimeout(() => {
      this.handle = null;
      this.onChange(null);
    }, this.ms);
  }

  dismiss(): void {
    if (this.handle == null) return;
    this.clear();
    this.onChange(null);
  }

  private clear() {
    if (this.handle != null) clearTimeout(this.handle);
    this.handle = null;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter mobile test -- bannerTimer`
Expected: 3 passed.

- [ ] **Step 5: Write the Banner provider**

```tsx
// apps/mobile/components/ui/Banner.tsx
/**
 * Banner — the response to a tap that failed (UX-GLOB-06). Mounted ONCE by BannerProvider,
 * pinned under the status bar above the navigator, outside any scroll view, so it is visible
 * regardless of scroll position. Auto-dismisses after 4 s or on the next touch anywhere.
 *
 *   const banner = useBanner();
 *   banner.show(t('missingInformation', { ns: 'common' }));
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { BannerTimer, type BannerState } from './bannerTimer';
import { Text } from './Text';

const AUTO_DISMISS_MS = 4000;

type Ctx = { show: (message: string, tone?: 'error' | 'success') => void };
const BannerContext = createContext<Ctx | null>(null);

export function BannerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BannerState>(null);
  const timer = useMemo(() => new BannerTimer(AUTO_DISMISS_MS, setState), []);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (state) AccessibilityInfo.announceForAccessibility(state.message);
  }, [state]);

  const ctx = useMemo<Ctx>(() => ({ show: (message, tone = 'error') => timer.show(message, tone) }), [timer]);

  return (
    <BannerContext.Provider value={ctx}>
      {/* Capture-phase touch anywhere dismisses; the touch still reaches its target. */}
      <View style={styles.root} onStartShouldSetResponderCapture={() => { timer.dismiss(); return false; }}>
        {children}
        {state ? (
          <View
            pointerEvents="none"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="banner"
            style={[styles.banner, { top: insets.top + space[2] }, state.tone === 'success' ? styles.success : styles.error]}
          >
            <Text variant="bodyStrong" tone="inverse" numberOfLines={2}>
              {state.message}
            </Text>
          </View>
        ) : null}
      </View>
    </BannerContext.Provider>
  );
}

export function useBanner(): Ctx {
  const ctx = useContext(BannerContext);
  if (!ctx) throw new Error('useBanner needs BannerProvider above it');
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: {
    position: 'absolute',
    left: space[4],
    right: space[4],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  error: { backgroundColor: colors.destructive },
  success: { backgroundColor: colors.successStrong },
});
```

- [ ] **Step 6: Export and mount**

`index.ts`: `export { BannerProvider, useBanner } from './Banner';`

`app/_layout.tsx`: wrap `SheetHost` (from Task 4) in `BannerProvider`, so the banner paints above sheets' backdrops only when a sheet is not open (the sheet is a `Modal`, which always paints on top; that is acceptable):
```tsx
            <StreamChatProvider>
              <BannerProvider>
                <SheetHost>
                  <Boot />
                </SheetHost>
              </BannerProvider>
            </StreamChatProvider>
```
`useSafeAreaInsets` needs a `SafeAreaProvider` above; `react-native-safe-area-context` is already used by screens, and expo-router mounts a provider at the root. If the app crashes on launch with "No safe area value available", wrap the providers in `<SafeAreaProvider>` from `react-native-safe-area-context` in `RootLayout`.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`

```bash
git add apps/mobile/components/ui/Banner.tsx apps/mobile/components/ui/bannerTimer.ts apps/mobile/components/ui/bannerTimer.test.ts apps/mobile/components/ui/index.ts apps/mobile/app/_layout.tsx
git commit -m "feat(ui): top Banner with auto-dismiss, mounted at the root"
```

---

### Task 6: TopBar variants

**Files:**
- Modify: `apps/mobile/components/ui/TopBar.tsx`
- Create: `apps/mobile/components/ui/topBarLayout.ts`
- Create: `apps/mobile/components/ui/topBarLayout.test.ts`

The decision of what each variant shows is pure and tested; the component only renders it.

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/components/ui/topBarLayout.test.ts
import { describe, expect, it } from 'vitest';
import { topBarLayout } from './topBarLayout';

describe('topBarLayout', () => {
  it('top: left title, no left control, no divider', () => {
    expect(topBarLayout('top', { hasTitle: true })).toEqual({ left: 'none', titleAlign: 'left', titleVariant: 'title', right: 'actions', divider: false });
  });
  it('nav: back, centred title, divider', () => {
    expect(topBarLayout('nav', { hasTitle: true })).toEqual({ left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true });
  });
  it('nav without a title keeps the slot empty (entity detail screens)', () => {
    expect(topBarLayout('nav', { hasTitle: false }).titleAlign).toBe('center');
  });
  it('edit: close on the left', () => {
    expect(topBarLayout('edit', { hasTitle: true }).left).toBe('close');
  });
  it('wizard: back left, close right', () => {
    expect(topBarLayout('wizard', { hasTitle: true })).toEqual({ left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'close', divider: true });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- topBarLayout`

- [ ] **Step 3: Implement the layout table**

```ts
// apps/mobile/components/ui/topBarLayout.ts
export type TopBarVariant = 'top' | 'nav' | 'edit' | 'wizard';
export type TopBarLayout = {
  left: 'none' | 'back' | 'close';
  titleAlign: 'left' | 'center';
  titleVariant: 'title' | 'bodyStrong';
  right: 'actions' | 'close';
  divider: boolean;
};

/** UX-GLOB-01: the three header patterns, plus the wizard's two-control case. */
export function topBarLayout(variant: TopBarVariant, _opts: { hasTitle: boolean }): TopBarLayout {
  switch (variant) {
    case 'top':
      return { left: 'none', titleAlign: 'left', titleVariant: 'title', right: 'actions', divider: false };
    case 'nav':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true };
    case 'edit':
      return { left: 'close', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true };
    case 'wizard':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'close', divider: true };
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter mobile test -- topBarLayout`
Expected: 5 passed.

- [ ] **Step 5: Rewrite TopBar**

Replace `apps/mobile/components/ui/TopBar.tsx` with:

```tsx
/**
 * TopBar — the app's one header (UX-GLOB-01). Four variants:
 *
 *   top     tab roots: left-aligned large title, no back, no divider, up to two actions
 *   nav     screens you navigate into: back left, centred title (omit `title` on entity
 *           detail screens whose name is in the body), divider, up to two actions
 *   edit    create/edit: ✕ left instead of back, centred title, divider; ✕ leaves the whole
 *           task and confirms first when `dirty`
 *   wizard  multi-step creation: back left to step back, ✕ right to leave the flow
 *
 * Both side slots are pinned to one width so the title is centred by construction.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, space } from '../../theme';
import { IconButton } from './IconButton';
import { useConfirm } from './SheetHost';
import { Text } from './Text';
import { topBarLayout, type TopBarVariant } from './topBarLayout';

export type TopBarAction = { icon: string | React.ReactNode; label: string; onPress: () => void; testID?: string };

type Props = {
  variant?: TopBarVariant;
  title?: string;
  /** Back affordance (nav, wizard). */
  onBack?: () => void;
  /** Close affordance (edit, wizard). Wrapped in a discard confirmation when `dirty`. */
  onClose?: () => void;
  /** The form has unsaved input; ✕ confirms before running `onClose`. */
  dirty?: boolean;
  /** Up to two right-hand actions (top, nav, edit). */
  actions?: TopBarAction[];
  /** Deprecated single action; kept so existing call sites compile until they migrate. */
  action?: TopBarAction;
  backLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

const SIDE = 44;

export function TopBar({ variant = 'nav', title, onBack, onClose, dirty = false, actions, action, backLabel, style, testID }: Props) {
  const { t } = useT('common');
  const confirm = useConfirm();
  const layout = topBarLayout(variant, { hasTitle: Boolean(title) });
  const rightActions = (actions ?? (action ? [action] : [])).slice(0, 2);

  const close = async () => {
    if (!onClose) return;
    if (dirty) {
      const ok = await confirm({
        title: t('discardTitle'),
        body: t('discardBody'),
        confirmLabel: t('discardConfirm'),
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const backButton = onBack ? (
    <IconButton icon="‹" accessibilityLabel={backLabel ?? t('back')} size="lg" onPress={onBack} testID={testID ? `${testID}-back` : undefined} />
  ) : null;
  const closeButton = onClose ? (
    <IconButton icon="✕" accessibilityLabel={t('close')} size="lg" onPress={close} testID={testID ? `${testID}-close` : undefined} />
  ) : null;

  return (
    <View testID={testID} style={[styles.bar, layout.divider && styles.divider, style]}>
      {layout.left !== 'none' ? (
        <View style={styles.side}>{layout.left === 'back' ? backButton : closeButton}</View>
      ) : null}

      {title ? (
        <Text
          variant={layout.titleVariant}
          tone="default"
          numberOfLines={1}
          style={[styles.title, layout.titleAlign === 'left' ? styles.titleLeft : styles.titleCenter]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={[styles.side, styles.sideRight, rightActions.length > 1 && styles.sideWide]}>
        {layout.right === 'close'
          ? closeButton
          : rightActions.map((a) => (
              <IconButton key={a.label} icon={a.icon} accessibilityLabel={a.label} size="lg" onPress={a.onPress} testID={a.testID} />
            ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    backgroundColor: colors.background,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  side: { width: SIDE, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' },
  sideWide: { width: SIDE * 2 },
  title: { flex: 1 },
  titleCenter: { textAlign: 'center' },
  titleLeft: { textAlign: 'left' },
});
```

Notes: with the `top` variant there is no left slot, so a left-aligned title starts at the bar's padding, and the right slot still reserves space. Existing call sites pass `title` + `onBack` (+ `action`) and keep working as `nav` with a divider, which is the intended new look for them.

- [ ] **Step 6: Typecheck, lint, tests, commit**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`
Expected: clean; existing call sites compile (`action` is still accepted).

```bash
git add apps/mobile/components/ui/TopBar.tsx apps/mobile/components/ui/topBarLayout.ts apps/mobile/components/ui/topBarLayout.test.ts
git commit -m "feat(ui): TopBar variants top/nav/edit/wizard with divider, two actions and a dirty-aware close"
```

---

### Task 7: Avatar colour palette

**Files:**
- Create: `apps/mobile/components/ui/avatarColour.ts`
- Create: `apps/mobile/components/ui/avatarColour.test.ts`
- Modify: `apps/mobile/components/ui/Avatar.tsx`
- Modify: `apps/mobile/theme/index.ts` (export the avatar ramp)

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/components/ui/avatarColour.test.ts
import { describe, expect, it } from 'vitest';
import { AVATAR_COLOURS, avatarColour, contrastRatio } from './avatarColour';

describe('avatarColour', () => {
  it('is deterministic per key', () => {
    expect(avatarColour('user-1')).toBe(avatarColour('user-1'));
  });
  it('spreads different keys across the palette', () => {
    const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(avatarColour));
    expect(picks.size).toBeGreaterThan(3);
  });
  it('falls back to the first colour without a key', () => {
    expect(avatarColour(null)).toBe(AVATAR_COLOURS[0]);
  });
  it('every colour carries white text at 4.5:1 or better', () => {
    for (const c of AVATAR_COLOURS) expect(contrastRatio(c, '#ffffff'), c).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- avatarColour`

- [ ] **Step 3: Add the ramp to the theme and implement**

In `apps/mobile/theme/index.ts`, after `export { palette };`, add:
```ts
/**
 * Avatar fallback backgrounds (UX-GLOB-04): eight saturated 700-step colours from the shared
 * ramps, each contrast-checked against white in avatarColour.test.ts. Picked per user id so a
 * person keeps their colour everywhere and is never a grey circle.
 */
export const avatarRamp = [
  palette.purple[700],
  palette.teal[700],
  palette.green[700],
  palette.sky[700],
  palette.blue[700],
  palette.rose[700],
  palette.orange[700],
  palette.red[700],
] as const;
```

```ts
// apps/mobile/components/ui/avatarColour.ts
import { avatarRamp } from '../../theme';

export const AVATAR_COLOURS: readonly string[] = avatarRamp;

/** Deterministic colour for an id (or name when no id exists). */
export function avatarColour(key: string | null | undefined): string {
  if (!key) return AVATAR_COLOURS[0]!;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length]!;
}

/** WCAG contrast ratio between two hex colours. Kept here so the palette is tested, not trusted. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [l1, l2] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (l1! + 0.05) / (l2! + 0.05);
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter mobile test -- avatarColour`
Expected: 4 passed. If a ramp colour fails 4.5:1 against white, swap it for the ramp's 800 step in `avatarRamp` and re-run; do not lower the threshold.

- [ ] **Step 5: Use it in Avatar**

In `apps/mobile/components/ui/Avatar.tsx`: add `colourKey?: string | null` to `Props` (doc: "user id; falls back to `name`"), import `avatarColour`, and change the fallback rendering:

```tsx
      ) : (
        <Text variant={labelFor[size]} tone="inverse">
          {initialsOf(name)}
        </Text>
      )}
```
and the container style: `style={[styles.base, shape, !uri && { backgroundColor: avatarColour(colourKey ?? name) }, style]}`. Remove `backgroundColor: colors.primary` from `styles.base` and the stale comment about 2.3:1. `Text` tone `inverse` is `colors.card` (white).

- [ ] **Step 6: Typecheck, lint, tests, commit**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`

```bash
git add apps/mobile/components/ui/avatarColour.ts apps/mobile/components/ui/avatarColour.test.ts apps/mobile/components/ui/Avatar.tsx apps/mobile/theme/index.ts
git commit -m "feat(ui): Avatar initials on a deterministic coloured background, contrast-tested"
```

---

### Task 8: First consumers

**Files:**
- Modify: `apps/mobile/components/event/PendingActionsSheet.tsx`
- Modify: `apps/mobile/app/notifications/index.tsx`
- Modify: `apps/mobile/app/event/create/index.tsx`

- [ ] **Step 1: PendingActionsSheet on BottomSheet**

Replace the `Modal … </Modal>` block in `PendingActionsSheet.tsx` with:

```tsx
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('pendingActionsTitle', { count: actions.length })}
        testID="pending-actions-sheet"
      >
        {actions.map((a) => (
          <SheetRow key={a.key} label={label(a)} onPress={() => go(a)} testID={`pending-action-${a.key}`} />
        ))}
      </BottomSheet>
```
Update imports to `import { BottomSheet, Card, SheetRow, Text } from '../ui';`, drop `Modal`, `Pressable`, `ListRow` and the `backdrop`/`sheet`/`sheetTitle` styles. The in-sheet Close row is no longer needed (the ✕ is the close control); remove `pendingActionsClose` usages here but keep the key in i18n if any test references it (grep `pending-actions-close` in `apps/mobile/e2e`; update the selector to `pending-actions-sheet-close` if found).

- [ ] **Step 2: Notifications ••• menu on useActionSheet**

In `apps/mobile/app/notifications/index.tsx`: remove `menuOpen` state, the `Modal` block and the `backdrop`/`sheet`/`sheetRow`/`sheetText` styles. Add `const show = useActionSheet();` (import from `../../components/ui`) and change the header button:

```tsx
          headerRight: () => (
            <IconButton
              icon="•••"
              accessibilityLabel={t('more')}
              onPress={async () => {
                const key = await show({
                  actions: [
                    { key: 'markAllRead', label: t('markAllRead') },
                    { key: 'clearAll', label: t('clearAll'), destructive: true },
                  ],
                });
                if (key === 'markAllRead') markAllRead.mutate();
                if (key === 'clearAll') clearAll.mutate();
              }}
            />
          ),
```
"Clear all" is destructive, so the host confirms it before returning the key. Remove the now-unused `Modal`, `Pressable` imports.

- [ ] **Step 3: Wizard discard on useConfirm**

In `apps/mobile/app/event/create/index.tsx`: `const confirm = useConfirm();` and

```ts
  const onClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: t('discardTitle'),
        body: t('discardBody'),
        confirmLabel: t('discardConfirm'),
        cancelLabel: t('discardCancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  };
```
Remove the `Alert` import if nothing else uses it. (The header itself is converted to the `wizard` variant in the headers plan, not here.)

- [ ] **Step 4: Checks**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm i18n:check && pnpm --filter mobile test`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/event/PendingActionsSheet.tsx apps/mobile/app/notifications/index.tsx "apps/mobile/app/event/create/index.tsx"
git commit -m "refactor(mobile): pending actions, notifications menu and wizard discard on the new sheet primitives"
```

---

### Task 9: Gallery sections and the E2E tree assertions

**Files:**
- Modify: `apps/mobile/components/ui/Gallery.stories.tsx`
- Modify: `apps/mobile/e2e/suites/00-design-system.e2e.ts`

- [ ] **Step 1: Add gallery sections**

In `Overview()`, replace the `TopBar` section with all four variants and add sections for the sheet, the banner and the coloured avatars:

```tsx
      <Section title="TopBar">
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="top" title="Home" actions={[{ icon: '⌕', label: 'Search', onPress: () => {} }]} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="nav" title="Members" onBack={() => {}} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="nav" onBack={() => {}} actions={[{ icon: '⋯', label: 'More', onPress: () => {} }]} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="edit" title="Edit profile" onClose={() => {}} />
        </Card>
        <Card padding="none">
          <TopBar variant="wizard" title="Create event" onBack={() => {}} onClose={() => {}} />
        </Card>
      </Section>

      <Section title="BottomSheet">
        <GallerySheetDemo />
      </Section>

      <Section title="Banner">
        <GalleryBannerDemo />
      </Section>
```
and extend the Avatar section with two more entries: `<Avatar name="Rui Trindade" colourKey="user-a" size="lg" />` and `<Avatar name="Sara Lima" colourKey="user-b" size="lg" />`.

Add the two demo components at the bottom of the file:

```tsx
function GallerySheetDemo() {
  const confirm = useConfirm();
  const show = useActionSheet();
  const [last, setLast] = useState<string>('');
  return (
    <View style={{ gap: space[2] }}>
      <Button
        label="Open confirm"
        variant="outline"
        onPress={async () => setLast((await confirm({ title: 'Delete this?', body: 'It cannot be undone.', confirmLabel: 'Delete', destructive: true })) ? 'confirmed' : 'cancelled')}
      />
      <Button
        label="Open action sheet"
        variant="outline"
        onPress={async () => setLast((await show({ title: 'Ana Silva', actions: [{ key: 'msg', label: 'Message' }, { key: 'remove', label: 'Remove', destructive: true }] })) ?? 'dismissed')}
      />
      <Text variant="caption" tone="muted">Last result: {last || '—'}</Text>
    </View>
  );
}

function GalleryBannerDemo() {
  const banner = useBanner();
  return <Button label="Show banner" variant="outline" onPress={() => banner.show('Missing information')} />;
}
```
The Storybook route is mounted inside the root layout, so `SheetHost` and `BannerProvider` are above it. Add the imports (`useConfirm`, `useActionSheet`, `useBanner`, `useState`, `View`, `space`).

- [ ] **Step 2: Extend the E2E tree assertions**

In `00-design-system.e2e.ts`, inside `'primitives announce their content, not their glyphs'`, before the glyph check, add:

```ts
    // 3. Every TopBar control has a real name, and the variants are all mounted.
    for (const label of ['Search', 'More', 'Close', 'Back']) {
      expect(queryAll(tree, { text: new RegExp(`^${label}$`, 'i'), type: 'Button' }).length, `a TopBar control named ${label}`).toBeGreaterThan(0);
    }
    // The wizard bar carries both: the heading text sits between a Back and a Close.
    expect(query(tree, { text: /create event/i }), 'wizard bar title').toBeDefined();
```
The existing glyph assertion now also covers the ✕ and ‹ on every variant, since they are `IconButton`s with labels.

Add a new `it` after it, exercising the sheet and the banner:

```ts
  it('sheet and banner primitives are reachable and labelled', async () => {
    await scrollUntilVisible(/open confirm/i);
    await tapByLabel(/open confirm/i);
    let tree = await snapshot();
    expect(query(tree, { text: /delete this\?/i }), 'confirm sheet title').toBeDefined();
    expect(query(tree, { text: /^close$/i, type: 'Button' }), 'confirm sheet ✕ is labelled').toBeDefined();
    await tapByLabel(/^delete$/i);
    tree = await snapshot();
    expect(query(tree, { text: /last result: confirmed/i })).toBeDefined();

    await tapByLabel(/open action sheet/i);
    await tapByLabel(/^remove$/i);          // destructive → the host asks to confirm
    tree = await snapshot();
    expect(query(tree, { text: /^remove$/i, type: 'Button' }), 'destructive row asks for confirmation').toBeDefined();
    await tapByLabel(/^cancel$/i);
    tree = await snapshot();
    expect(query(tree, { text: /last result: dismissed/i })).toBeDefined();

    await tapByLabel(/show banner/i);
    tree = await snapshot();
    expect(query(tree, { text: /missing information/i }), 'banner text is in the tree').toBeDefined();
  }, 180_000);
```
Check `apps/mobile/e2e/driver/actions.ts` for the tap helper's real name (it may be `tap` taking a selector object rather than `tapByLabel`) and use that; the driver README in `apps/mobile/e2e/README.md` lists them.

- [ ] **Step 3: Run the gallery suite**

Run: `pnpm --filter mobile e2e -- --suite 00`
Expected: both tests pass (this builds the app; allow 20 to 30 minutes on first run). If the suite cannot run on this machine, run `pnpm --filter mobile typecheck` (which covers `e2e/tsconfig.json`) and note in the PR that suite 00 is pending on CI.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui/Gallery.stories.tsx apps/mobile/e2e/suites/00-design-system.e2e.ts
git commit -m "test(mobile): gallery sections and tree assertions for sheets, banner, TopBar variants, avatars"
```

---

### Task 10: Full verification and PR

- [ ] **Step 1: Repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`
Expected: green.

- [ ] **Step 2: Simulator walk**

Run the app (`pnpm --filter mobile ios`, or the E2E build) against the local stack seeded with `pnpm seed:audit -- --target local`. Check: the event detail's pending-actions card opens a bottom sheet with a ✕; the notifications ••• opens a bottom sheet, "Clear all" asks for confirmation in a second sheet; leaving the create-event wizard after typing asks "Discard changes?" in a sheet; avatars in chat rows and posts show coloured initials.

- [ ] **Step 3: PR**

```bash
git push -u origin feat/ux-foundations
gh pr create --title "feat(ui): UX foundations — BottomSheet, useConfirm/useActionSheet, Banner, TopBar variants, coloured Avatar" --body-file <write the body to a scratch file first>
```
Body: implements section 0 of docs/superpowers/specs/2026-09-12-ux-global-rules-design.md; list the four primitives and the three converted consumers; note that all other screens still use their old headers, alerts and modals, which the nine follow-up PRs convert; end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
