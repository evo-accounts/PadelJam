# Result Image-Card (B3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Share externally" in the Share Results sheet shares a branded standings **image** (capture → expo-sharing), falling back to the existing text share.

**Architecture:** A presentational `ResultCard` renders the standings; `ShareResultsModal` mounts it off-screen, captures it with `react-native-view-shot`, and shares via `expo-sharing`, with the current text/clipboard path as fallback.

**Tech Stack:** React Native, `react-native-view-shot` (native), `expo-sharing`, `@padel/api`.

**Spec:** [docs/superpowers/specs/2026-06-19-result-image-card-design.md](specs/2026-06-19-result-image-card-design.md)

**Note:** `react-native-view-shot` is a native module — capture works in the EAS dev build, not Expo Go (where it falls back to text). No new unit test (presentational + native); verified by typecheck + parity test locally, and on-device for the actual capture/share.

---

## Task 1: Dep + `ResultCard` + i18n

**Files:** `apps/mobile/package.json` (+lockfile via expo install); Create `apps/mobile/components/event/ResultCard.tsx`; Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Install the native dep** — from `apps/mobile/`:
`npx expo install react-native-view-shot`
(SDK-56-aligned; adds it to `package.json` + lockfile. Confirm it appears in `apps/mobile/package.json`.)

- [ ] **Step 2: Create `apps/mobile/components/event/ResultCard.tsx`**
```tsx
import { useEventResultSummary } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

/** Presentational standings card, sized for image capture (rendered off-screen by ShareResultsModal). */
export function ResultCard({ eventId, eventName }: { eventId: string; eventName?: string }) {
  const { t } = useT('event');
  const { data: rows } = useEventResultSummary(eventId);
  const placements = rows ?? [];
  return (
    <View style={styles.card}>
      {eventName ? <Text style={styles.event}>{eventName}</Text> : null}
      <Text style={styles.heading}>{t('resultCardHeading')}</Text>
      {placements.length === 0 ? (
        <Text style={styles.row}>—</Text>
      ) : (
        placements.map((r) => (
          <Text key={r.rank} style={styles.row}>{`${r.rank}.  ${r.name}  ·  ${r.points}`}</Text>
        ))
      )}
      <Text style={styles.footer}>Padel Jam</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 340, backgroundColor: '#0B1F3A', borderRadius: 16, padding: 24, gap: 8 },
  event: { color: '#9DB6E0', fontSize: 14, fontWeight: '600' },
  heading: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  row: { color: '#EAF2FF', fontSize: 17, fontWeight: '600' },
  footer: { color: '#5A7AB0', fontSize: 13, fontWeight: '700', marginTop: 16, textAlign: 'right' },
});
```
(`ResultPlacement { rank, name, points }` is what `useEventResultSummary` returns.)

- [ ] **Step 3: i18n** — add `resultCardHeading` right after each `shareResultsTitle` in the `event` namespace:
  - pt-PT (after line ~1647 `shareResultsTitle: 'Partilhar resultados',`): `resultCardHeading: 'Classificação final',`
  - pt-BR (after line ~2078): `resultCardHeading: 'Classificação final',`
  - en (after line ~2509 `shareResultsTitle: 'Share results',`): `resultCardHeading: 'Final standings',`

- [ ] **Step 4: Verify + commit**
`pnpm -w typecheck` (13/13) + `pnpm --filter mobile test` (parity green — new `event` key in all 3 locales).
```bash
git add apps/mobile/package.json apps/mobile/components/event/ResultCard.tsx apps/mobile/lib/i18n-mobile.ts pnpm-lock.yaml
git commit -m "feat(events): ResultCard standings component + react-native-view-shot dep (B3)"
```

---

## Task 2: `ShareResultsModal` image-first share + opener wiring

**Files:** Modify `apps/mobile/components/event/ShareResultsModal.tsx`; Modify `apps/mobile/app/event/[id]/live.tsx`.

- [ ] **Step 1: ShareResultsModal — imports + prop + ref**
Add imports:
```tsx
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useRef } from 'react';
import { ResultCard } from './ResultCard';
```
(`useState`, `View`, `Share`, `Clipboard` are already imported.) Add `eventName?: string` to the props type. Inside the component add: `const cardRef = useRef<View>(null);`

- [ ] **Step 2: Rewrite `onShare` to image-first**
Replace the existing `onShare` body with:
```tsx
  const onShare = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('shareResultsTitle') });
        return;
      }
      throw new Error('sharing_unavailable');
    } catch {
      // Fallback: native text share (current behavior), then clipboard.
      try {
        await Share.share({ message: summaryText });
      } catch {
        await Clipboard.setStringAsync(summaryText);
        setCopied(true);
      }
    }
  };
```
(If `captureRef(cardRef)` errors on the ref type, cast: `captureRef(cardRef as React.RefObject<View>, …)` — match the lib's accepted ref type.)

- [ ] **Step 3: Mount the card off-screen**
Inside the sheet `<View style={styles.sheet}>` (e.g. just before its closing `</View>`), render the capture target:
```tsx
          <View ref={cardRef} collapsable={false} style={styles.offscreen}>
            <ResultCard eventId={eventId} eventName={eventName} />
          </View>
```
Add to the StyleSheet: `offscreen: { position: 'absolute', left: -9999, top: 0 },`
(`collapsable={false}` keeps the wrapper a real native view so `react-native-view-shot` can capture it on Android. It's mounted whenever the sheet is `visible`.)

- [ ] **Step 4: Pass `eventName` from the opener**
In `apps/mobile/app/event/[id]/live.tsx`, the `<ShareResultsModal ... />` (around line 728) has `event` in scope (`const { data: event } = useEvent(id)`). Add the prop:
```tsx
        eventName={event.name}
```

- [ ] **Step 5: Verify + commit**
`pnpm -w typecheck` → 13/13.
```bash
git add apps/mobile/components/event/ShareResultsModal.tsx apps/mobile/app/event/[id]/live.tsx
git commit -m "feat(events): share results as an image card with text fallback (B3)"
```

---

## Verification (end-to-end)

1. **Types/i18n:** `pnpm -w typecheck` (13/13); `pnpm --filter mobile test` (parity green).
2. **Gated (EAS dev build):** finish/complete an event → Share Results → "Share externally" → the OS share sheet offers the standings **image**; in Expo Go / on capture failure it falls back to the text share + clipboard. "Post to feed" unchanged.

## Out of scope

Auto-posting the image to the feed; card theming; PT/PT-BR copy polish (key present).
