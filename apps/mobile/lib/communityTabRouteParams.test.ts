import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the regression fixed in #20.
 *
 * `useLocalSearchParams()` returns only the params of the screen's OWN navigation
 * route — expo-router feeds `LocalRouteParamsContext` from `route.params`
 * (`expo-router/build/useScreens.js`). A StackRouter instantiates routes lazily, so
 * a pushed screen always carries the matched path's params; a **TabRouter
 * instantiates every screen up front and gives the non-anchor ones
 * `params: undefined`**.
 *
 * So inside the js-top-tabs layout every tab except the anchor read `id` as
 * undefined, queried `community_id=eq.undefined`, got a PostgREST 400, and rendered
 * its empty state — the Members tab said "No members yet." on a community whose own
 * header said "6 members". The id is resolved once in `(home)/_layout.tsx` and
 * published through `CommunityIdProvider`; tabs must read `useCommunityId()`.
 *
 * This is a source-text assertion rather than a behavioural test, deliberately: it
 * is instant, needs no simulator, and cannot flake. It covers any tab added later
 * because the file list is read from disk. It does NOT protect a *different* tab
 * navigator added elsewhere — worth generalising only once a second one exists.
 *
 * `useGlobalSearchParams` is deliberately not covered: global params *do* resolve
 * on a non-anchor tab, so it would not reproduce this bug, and flagging it here
 * would attach a failure message ("...=eq.undefined") that is simply untrue of it.
 */
const MOBILE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME_DIR = join(MOBILE_ROOT, 'app', 'community', '[id]', '(home)');

const read = (f: string) => readFileSync(join(HOME_DIR, f), 'utf8');

/**
 * Matches a *use* of the hook — a call, with or without a type argument — not the
 * bare identifier. Matching the word alone would fail a tab that documents the
 * invariant in a comment ("don't reach for useLocalSearchParams here"), which the
 * regression note above actively invites, and would let the layout's positive
 * assertion pass on prose that mentions the hook without calling it.
 */
const USES_LOCAL_SEARCH_PARAMS = /useLocalSearchParams\s*[(<]/;

describe('community (home) tabs resolve the community id from context', () => {
  const files = readdirSync(HOME_DIR).filter((f) => f.endsWith('.tsx'));
  const tabs = files.filter((f) => f !== '_layout.tsx');

  // Without this the suite could pass vacuously if the directory ever moves —
  // a silently-green guard is the exact failure mode being guarded against.
  it('finds the tab screens and their layout', () => {
    expect(files).toContain('_layout.tsx');
    expect(tabs.length).toBeGreaterThanOrEqual(5);
  });

  // The two assertions below are source-text matches, so the pattern *is* the guard:
  // a guard that fires on a comment would punish documenting the invariant, and one
  // satisfied by a comment would let the layout stop resolving the id unnoticed.
  it('matches a call to the hook, not a mention of it', () => {
    expect('const { id } = useLocalSearchParams();').toMatch(USES_LOCAL_SEARCH_PARAMS);
    expect('const { id } = useLocalSearchParams<{ id: string }>();').toMatch(
      USES_LOCAL_SEARCH_PARAMS,
    );
    expect('// Never useLocalSearchParams here — the tab reads useCommunityId().').not.toMatch(
      USES_LOCAL_SEARCH_PARAMS,
    );
    expect(' * a non-anchor tab gets undefined from useLocalSearchParams.').not.toMatch(
      USES_LOCAL_SEARCH_PARAMS,
    );
  });

  it.each(tabs)('%s does not read the route param directly', (file) => {
    expect(
      read(file),
      `${file} calls useLocalSearchParams(). Inside the top-tabs layout that is undefined `
        + 'on every tab but the anchor, so its queries go out as `...=eq.undefined` and the '
        + 'screen renders an empty state. Use useCommunityId() instead.',
    ).not.toMatch(USES_LOCAL_SEARCH_PARAMS);
  });

  it('the layout publishes the id it resolved', () => {
    const layout = read('_layout.tsx');
    // The layout is the one route here that DOES carry the param, so it is the
    // correct place to read it — and it must pass it down for the tabs to use.
    expect(layout).toMatch(USES_LOCAL_SEARCH_PARAMS);
    expect(
      layout,
      '(home)/_layout.tsx must wrap the tabs in CommunityIdProvider, otherwise '
        + 'useCommunityId() throws in every tab.',
    ).toMatch(/CommunityIdProvider/);
  });
});
