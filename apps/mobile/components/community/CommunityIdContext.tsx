import { createContext, useContext, type ReactNode } from 'react';

/**
 * The community id for the screens under `app/community/[id]/(home)/`.
 *
 * Those screens must NOT read the id with `useLocalSearchParams()` themselves.
 * Expo Router gives a screen only the params of its OWN navigation route — it
 * provides `LocalRouteParamsContext` from `route.params`
 * (`expo-router/build/useScreens.js`) — and a tab navigator materialises every
 * route except the anchor one with `params: undefined`. Inside the js-top-tabs
 * layout that made `id` undefined on all tabs but `posts`, so Members/Groups/
 * About/Events queried `community_id=eq.undefined` and PostgREST answered 400
 * (`22P02 invalid input syntax for type uuid`), which the screens rendered as
 * their empty states.
 *
 * `(home)/_layout.tsx` is a route that does carry the param, so it resolves the
 * id once and publishes it here for every tab to read.
 */
const CommunityIdContext = createContext<string | null>(null);

export function CommunityIdProvider({ id, children }: { id: string; children: ReactNode }) {
  return <CommunityIdContext.Provider value={id}>{children}</CommunityIdContext.Provider>;
}

export function useCommunityId(): string {
  const id = useContext(CommunityIdContext);
  if (!id) {
    throw new Error('useCommunityId must be used within a CommunityIdProvider');
  }
  return id;
}
