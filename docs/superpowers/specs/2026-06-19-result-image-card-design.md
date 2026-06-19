# Result Image-Card (B3) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Let an organizer share an event's final standings as a **branded image** (not just text). The existing
"Share externally" button in the Share Results sheet captures a standings card and shares it via `expo-sharing`,
falling back to the current text share when capture/sharing isn't available. Closes the 5H deferred
"result image-card generation."

## Scope decision (from the brainstorm)

Upgrade the existing external-share button to **image-first with text fallback** (one button), rather than a
separate image button. Auto-posting the image to the feed and richer card customization stay out of scope.

## Verified context

- **`ShareResultsModal`** (`apps/mobile/components/event/ShareResultsModal.tsx`): props
  `{ visible, onClose, eventId, communityId, summaryText }`. Has "Post to feed" (`usePostEventResult`) +
  "Share externally" (`onShare` → `Share.share({ message: summaryText })`, clipboard fallback).
- **Standings data**: `useEventResultSummary(eventId)` returns ranked rows `{ rank, name, points }` (used by
  `PostCard`'s `ResultBody`, which renders `${rank}. ${name} · ${points}`).
- **`expo-sharing`** is already a dependency + app.json plugin. **`react-native-view-shot` is NOT** present.
- **A5 parity test** (`apps/mobile/lib/i18n-mobile.test.ts`) guards the `event` namespace → any new key needs
  pt-PT, pt-BR, en.

## Architecture

### 1. Dependency

`npx expo install react-native-view-shot` (SDK-56-aligned). It's a native module → works in the EAS dev build,
not Expo Go (capture there throws → handled by the text fallback).

### 2. `ResultCard` component — `apps/mobile/components/event/ResultCard.tsx`

Presentational, fixed-width (~340pt) card for capture:
- Heading: `eventName` (if provided) + `t('resultCardHeading')` ("Final standings").
- Body: ranked rows from `useEventResultSummary(eventId)` — `${rank}. ${name} · ${points}` (all rows; the set
  is one event's players, naturally bounded). Empty → a muted "—"/no-scores line.
- Footer: a "Padel Jam" wordmark.
- Solid background + padding so the PNG looks intentional. No capture logic itself; it just renders.

### 3. `ShareResultsModal` upgrade

- Add `eventName?: string` to the props (passed by the opener — the live/manage screen has the event row).
- Render `<ResultCard eventId={eventId} eventName={eventName} />` **off-screen** inside the sheet while
  `visible`: a wrapping `View` with `style={{ position: 'absolute', left: -9999, top: 0 }}` (fixed width so it
  lays out) carrying a `ref` (`useRef<View>`). Off-screen-but-mounted so `captureRef` can snapshot it.
- Rewrite `onShare`:
  ```ts
  try {
    const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
    if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('shareResultsTitle') }); return; }
    throw new Error('sharing_unavailable');
  } catch {
    // Fallback: text share (current behavior), then clipboard.
    try { await Share.share({ message: summaryText }); }
    catch { await Clipboard.setStringAsync(summaryText); setCopied(true); }
  }
  ```
  (`captureRef` from `react-native-view-shot`; `Sharing` from `expo-sharing`; `Share`/`Clipboard` already
  imported.)
- The "Post to feed" path is unchanged.

### 4. i18n

Add `resultCardHeading` to the `event` namespace in all three locales:
- en `'Final standings'`, pt-PT `'Classificação final'`, pt-BR `'Classificação final'`.
(Reuse `shareResultsTitle` for the share dialog title; "Padel Jam" is a literal.)

### 5. Wiring the opener

Where `ShareResultsModal` is rendered (the in-progress/live event screen), pass `eventName={event.name}` if the
event is in scope there. If not readily available, omit it (the card heading degrades to just "Final
standings"). The implementation plan pins the exact call site.

## Error handling

- `captureRef` failure (Expo Go, layout race) or `Sharing` unavailable → caught → text `Share.share` → clipboard.
  The button always does something.
- Empty standings → the card renders a no-scores line; sharing still works (or the organizer just won't share).

## Testing / verification

- `pnpm -w typecheck` (13/13); i18n parity test green (new `resultCardHeading` in all locales).
- **No new unit test** — B3 is presentational UI + a native capture/share module; no meaningful pure logic to
  extract. Verified on the EAS dev build: open Share Results on a completed event → "Share externally" yields
  the image card in the OS share sheet; in Expo Go / on failure it falls back to the text share.

## Conventions followed

Reuse `useEventResultSummary` + `expo-sharing`; thin presentational `ResultCard`; new i18n in all locales (A5
parity); native dep via `expo install` (SDK-aligned); no migration. The existing post-to-feed + text-fallback
behavior is preserved.

## Out of scope

Auto-posting the image card to the community feed; card theming/customization; PT/PT-BR copy *polish* (key
present).
