# Spike: can mobile screens become theme-aware?

**Verdict: yes, and the cost is three lines per file plus one per colour.**
Recommend proceeding. Not merged as a feature — nothing mounts the provider yet.

## Why this was needed

Phase 2 (primitive adoption) was assumed to be the road to dark mode. It is not.

| | Files | Colour refs |
|---|---|---|
| Primitives (`components/ui`) | 12 | 62 |
| Screens | 124 | **1,075** |

Module-scope `StyleSheet.create` evaluates once at import, before any theme
exists. Making the 12 primitives theme-aware addresses 5% of the references.
Measured across three conversion PRs, primitive adoption removed ~8 colour
references each — so reaching dark mode that way is ~130 PRs. The screens have
to change directly.

## The API, and the mistake that shaped it

First attempt had the hook call `StyleSheet.create` for you. Converting one
53-key screen produced **81 type errors**.

`StyleSheet.create` types the object literal passed *directly* to it, so
`alignItems: 'center'` stays the literal `'center'`. Route it through a factory's
return value and TypeScript infers it first, widens it to `string`, then fails
the constraint. That file had 38 such properties.

Inverting it — the factory calls `create` itself — took 81 to 0:

```ts
const makeStyles = (c: ThemeColors) => StyleSheet.create({ ... });  // module scope
function Screen() { const styles = useThemedStyles(makeStyles); }
```

Module scope is load-bearing: `useMemo` keys on the factory's identity, so an
inline arrow rebuilds the stylesheet every render.

**Had this been built straight into the conversion work, those 81 errors would
have surfaced around file 40 of 124.**

## Measured cost

| Screen | Colours | Diff |
|---|---|---|
| `app/(tabs)/community/created.tsx` | 1 | +4 −3 |
| `app/event/[id]/live.tsx` | 41 | +45 −43 |

Fixed overhead is three lines; the rest is one line per colour reference, which
changes under any design. **124 files is tractable.**

(A first measurement of +194/−191 for `live.tsx` was my own re-indentation
churn. Keeping `create({` on the factory line removes it entirely.)

## What the spike found in the existing code

1. **`app/_layout.tsx` already swaps `DarkTheme`/`DefaultTheme`** from
   expo-router on the system scheme. Navigation chrome — header, tab bar — is
   ALREADY dark-aware. Only screen content is not. Dark mode is less
   finished-from-zero than assumed.
2. **A name collision.** expo-router exports `ThemeProvider`, used in that same
   file. Ours is `ColorSchemeProvider` for that reason.
3. **`components/useColorScheme.ts` already exists** and maps RN's
   `'unspecified'` to `'light'`. Reused rather than re-derived.
4. **`components/Themed.tsx` is untouched Expo boilerplate** reading
   `constants/Colors.ts` (`#2f95dc`), imported by exactly one file:
   `app/+not-found.tsx`. It is a second, parallel theming system with one
   consumer. Delete it as part of the migration.

## Verified

- Full E2E suite **15/15 files, 75/75 tests** with two screens converted
- Typecheck, lint (0 errors), 78 unit tests
- Unit tests: both schemes are key-identical, a factory yields different colours
  per scheme, and an inline snapshot pins the three tokens deliberately shared
  (`infoForeground`, `warningForeground`, `sidebarPrimaryForeground` — text on
  coloured badges, correctly constant)

## NOT verified — read before trusting this

**No converted screen has been rendered dark on a device.** Nothing mounts
`ColorSchemeProvider`, so both converted screens still resolve to `light`, and
the full-suite pass proves only *no regression*.

Untested: that the context propagates, and that `useMemo` re-runs on a scheme
change. Both need a renderer; this app has no RN render-test library and adding
one is a dependency decision, not a spike decision.

## Recommended next steps, in order

1. **Mount `ColorSchemeProvider` at the app root** and add an E2E capture with
   the simulator forced to dark. That closes the gap above and is small now that
   the mechanism is settled. Do this BEFORE bulk conversion — it is the last
   thing that could invalidate the pattern.
2. Convert screens in batches by directory, mirroring the Phase 2 PR shape.
3. Delete `components/Themed.tsx` and `constants/Colors.ts` with their one
   consumer.
4. Then finish Phase 2 primitive adoption, which is now clearly a
   code-quality goal rather than a dark-mode prerequisite.
