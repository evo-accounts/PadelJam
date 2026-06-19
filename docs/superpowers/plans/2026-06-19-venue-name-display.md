# Venue-Name Display on Event Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a venue-based event's real venue name + address on the detail screen instead of "location TBD".

**Architecture:** Embed the related venue in `useEvent`'s select (`venue:venues(name, address)`, typed via the file's `.returns<>()` pattern), then add a venue branch to the detail screen's "Where" section.

**Tech Stack:** `@padel/api` (Supabase PostgREST embed), React Native.

**Spec:** [docs/superpowers/specs/2026-06-19-venue-name-display-design.md](specs/2026-06-19-venue-name-display-design.md)

**Note:** the two files are coupled (the screen reads `event.venue`, which the query type must provide), so they're done in one task and typechecked together.

---

## Task 1: Embed venue in `useEvent` + render it on the detail screen

**Files:**
- Modify: `packages/api/src/events/queries.ts` (`useEvent`)
- Modify: `apps/mobile/app/event/[id]/index.tsx` (the "Where" section)

- [ ] **Step 1: Embed the venue in `useEvent` + type it**

In `packages/api/src/events/queries.ts`:
- Add `Tables` to the `@padel/db` type imports. There is no existing `@padel/db` import in this file, so add at the top (with the other imports):
  ```ts
  import type { Tables } from '@padel/db';
  ```
- Define an exported detail type and update `useEvent` to embed the venue using the file's established
  `.returns<>()` pattern (see e.g. lines ~82, ~427). Replace the current `useEvent`:
  ```ts
  export type EventDetail = Tables<'events'> & {
    venue: { name: string; address: string | null } | null;
  };

  export const useEvent = (id: string) => {
    const db = useDb();
    return useQuery({
      queryKey: qk.event(id),
      queryFn: async () => {
        const { data, error } = await db
          .from('events')
          .select('*, venue:venues(name, address)')
          .eq('id', id)
          .maybeSingle()
          .returns<EventDetail>();
        if (error) throw error;
        return data;
      },
    });
  };
  ```
  (`.maybeSingle().returns<EventDetail>()` yields `EventDetail | null`, matching the existing nullable-detail
  usage. `venue` is `null` when `venue_id` is null or the venue is soft-deleted — the `venues: read` policy
  filters `deleted_at is null`.)

- [ ] **Step 2: Render the venue branch on the detail screen**

In `apps/mobile/app/event/[id]/index.tsx`, find the "Where" section (the block with
`event.has_location && event.manual_location_name ? … : <Text>{t('locationTbd')}</Text>`). Replace that
conditional with a three-way (venue → manual → TBD):
```tsx
          {event.venue ? (
            <>
              <Text style={styles.body}>{event.venue.name}</Text>
              {event.venue.address ? (
                <Text style={styles.bodyMuted}>{event.venue.address}</Text>
              ) : null}
            </>
          ) : event.has_location && event.manual_location_name ? (
            <>
              <Text style={styles.body}>{event.manual_location_name}</Text>
              {event.manual_location_address ? (
                <Text style={styles.bodyMuted}>{event.manual_location_address}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.body}>{t('locationTbd')}</Text>
          )}
```
(Keep `whereTitle`, the `styles.body`/`styles.bodyMuted` styles, and the surrounding section markup unchanged. No new i18n.)

- [ ] **Step 3: Typecheck + API tests**

Run: `pnpm -w typecheck && pnpm --filter @padel/api test`
Expected: typecheck 13/13 (the `EventDetail` type flows into the screen so `event.venue` resolves); API tests pass. If `Tables<'events'>` isn't the correct helper name, verify the export in `packages/db/src/index.ts` and use the actual exported helper. If `.returns<EventDetail>()` errors on the chain, confirm it's placed after `.maybeSingle()` (matching the existing usage at ~line 427).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/events/queries.ts apps/mobile/app/event/[id]/index.tsx
git commit -m "fix(events): show venue name + address on event detail (resolve venue_id)"
```

---

## Verification (end-to-end)

1. **Types/API:** `pnpm -w typecheck` (13/13) + `pnpm --filter @padel/api test`.
2. **Simulator smoke:** open a venue-based event → the "Where" section shows the venue's name (and address if
   present); a manual-location event still shows its manual name/address; a no-location event still shows "TBD".
3. The `venues` embed is a PostgREST join over a public-read table — review-verified, exercised at runtime.

## Out of scope

Location on event cards / manage screen; `location_text` backfill; maps/coordinates.
