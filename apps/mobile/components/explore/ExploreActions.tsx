/**
 * The inline card actions of Explore and its See-all lists (UX-EXPL-02/03, D9, B1).
 *
 * - Player: Follow → Following. Unfollowing stays on the profile, so the resolved state is final
 *   here and the button goes inert.
 * - Community: Join (public) or Request (request to join) → Joined / Requested. A community with
 *   rules refuses a bare join (`rules_acknowledgement_required`), and its preview screen is where
 *   the rules are read and accepted, so the card hands over to it. An invitation is answered on
 *   that screen too: `join_community` on a request-to-join community would file a request rather
 *   than accept the invite.
 * - Group: Join → Joined, which also joins the parent community, as the group screen does.
 *
 * Every row says where the viewer stands (`viewer_state`, migration 0128), so no card fetches.
 * What a tap resolved to lives in {@link ExploreActionsProvider}, keyed by id — never in the card:
 * FlashList recycles cell components, so state held inside one would surface on another row.
 * The provider also keeps an acted-on row on screen after the refetch drops it (see
 * `stickyRows.ts`) and forgets everything when the screen loses focus.
 */
import {
  useFollowPlayer,
  useJoinCommunity,
  useJoinGroup,
  type CommunityViewerState,
  type GroupViewerState,
  type PlayerViewerState,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { Button, useBanner } from '@/components/ui';
import { withSticky, type ResolvedState, type StickyEntry } from './stickyRows';

export type ActionKind = 'players' | 'communities' | 'groups';

type Row = { id: string };
type Store = Record<ActionKind, Record<string, StickyEntry<Row>>>;
const EMPTY: Store = { players: {}, communities: {}, groups: {} };

type Ctx = {
  store: Store;
  resolve: (kind: ActionKind, row: Row, index: number, state: ResolvedState) => void;
};
const ExploreActionsContext = createContext<Ctx | null>(null);

export function ExploreActionsProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(EMPTY);
  // Forget on blur: by the next visit the rail has refetched without the rows acted on.
  useFocusEffect(useCallback(() => () => setStore(EMPTY), []));
  const resolve = useCallback<Ctx['resolve']>((kind, row, index, state) => {
    setStore((s) => ({ ...s, [kind]: { ...s[kind], [row.id]: { row, index, state } } }));
  }, []);
  const value = useMemo(() => ({ store, resolve }), [store, resolve]);
  return <ExploreActionsContext.Provider value={value}>{children}</ExploreActionsContext.Provider>;
}

/** `rows` with every acted-on row kept at its index. A no-op outside a provider. */
export function useStickyRows<T extends Row>(kind: ActionKind | null, rows: readonly T[]): T[] {
  const ctx = useContext(ExploreActionsContext);
  if (!ctx || !kind) return rows as T[];
  return withSticky(rows, ctx.store[kind] as Record<string, StickyEntry<T>>);
}

function useResolved(kind: ActionKind, id: string) {
  const ctx = useContext(ExploreActionsContext);
  return {
    resolved: ctx?.store[kind][id]?.state,
    resolve: (row: Row, index: number, state: ResolvedState) => ctx?.resolve(kind, row, index, state),
  };
}

/** The server's error code as copy: the explore ones first, then the community ones, then generic. */
function useErrorCopy() {
  const { t } = useT('discovery');
  return (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    return t(code, { defaultValue: t(code, { ns: 'community', defaultValue: t('actionError') }) });
  };
}

/**
 * Invalidating the explore prefix drops the acted-on row from the rail and its See-all list on
 * the next fetch. `useFollowPlayer` does this itself; the join mutations predate Explore's
 * viewer state and only refresh the community side.
 */
function useInvalidateExplore() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['explore'] });
}

export function PlayerFollowAction({
  player,
  index,
}: {
  player: Row & { viewer_state?: PlayerViewerState | null };
  index: number;
}) {
  const { t } = useT('discovery');
  const banner = useBanner();
  const errorCopy = useErrorCopy();
  const follow = useFollowPlayer();
  const { resolved, resolve } = useResolved('players', player.id);
  const following = resolved === 'following' || player.viewer_state === 'following';

  const onFollow = async () => {
    try {
      const state = await follow.mutateAsync(player.id);
      if (state === 'following') resolve(player, index, 'following');
    } catch (e) {
      banner.show(errorCopy(e));
    }
  };

  return following ? (
    <Button label={t('following')} variant="secondary" size="sm" disabled testID={`player-follow-${player.id}`} />
  ) : (
    <Button
      label={t('follow')}
      size="sm"
      loading={follow.isPending}
      onPress={onFollow}
      testID={`player-follow-${player.id}`}
    />
  );
}

export function CommunityJoinAction({
  community,
  index,
}: {
  community: Row & { privacy: string; viewer_state?: CommunityViewerState | null };
  index: number;
}) {
  const { t } = useT('discovery');
  const router = useRouter();
  const banner = useBanner();
  const errorCopy = useErrorCopy();
  const invalidate = useInvalidateExplore();
  const join = useJoinCommunity(community.id);
  const { resolved, resolve } = useResolved('communities', community.id);
  const state = resolved ?? community.viewer_state ?? 'none';
  const testID = `community-join-${community.id}`;
  const preview = () => router.push(`/community/${community.id}/join` as Href);

  if (state === 'joined') {
    return <Button label={t('joined')} variant="secondary" size="sm" disabled testID={testID} />;
  }
  if (state === 'requested') {
    return <Button label={t('requested')} variant="secondary" size="sm" disabled testID={testID} />;
  }
  if (state === 'member') {
    return (
      <Button
        label={t('open')}
        variant="secondary"
        size="sm"
        onPress={() => router.push(`/community/${community.id}` as Href)}
        testID={testID}
      />
    );
  }
  if (state === 'invited') {
    return <Button label={t('join')} size="sm" onPress={preview} testID={testID} />;
  }

  const isRequest = community.privacy === 'request_to_join';
  const onJoin = async () => {
    try {
      const result = await join.mutateAsync(false);
      resolve(community, index, result === 'requested' ? 'requested' : 'joined');
      void invalidate();
    } catch (e) {
      if (e instanceof Error && e.message === 'rules_acknowledgement_required') {
        preview();
        return;
      }
      banner.show(errorCopy(e));
    }
  };

  return (
    <Button
      label={isRequest ? t('request') : t('join')}
      size="sm"
      loading={join.isPending}
      onPress={onJoin}
      testID={testID}
    />
  );
}

export function GroupJoinAction({
  group,
  index,
}: {
  group: Row & { community_id: string; viewer_state?: GroupViewerState | null };
  index: number;
}) {
  const { t } = useT('discovery');
  const router = useRouter();
  const banner = useBanner();
  const errorCopy = useErrorCopy();
  const invalidate = useInvalidateExplore();
  const join = useJoinGroup();
  const { resolved, resolve } = useResolved('groups', group.id);
  const testID = `group-join-${group.id}`;

  if (resolved === 'joined') {
    return <Button label={t('joined')} variant="secondary" size="sm" disabled testID={testID} />;
  }
  if (group.viewer_state === 'member') {
    return (
      <Button
        label={t('open')}
        variant="secondary"
        size="sm"
        onPress={() => router.push(`/group/${group.id}` as Href)}
        testID={testID}
      />
    );
  }

  const onJoin = async () => {
    try {
      await join.mutateAsync({ groupId: group.id, communityId: group.community_id });
      resolve(group, index, 'joined');
      void invalidate();
    } catch (e) {
      // Joining a group is also entering its community; one with rules asks for them on its own
      // preview screen, which records the acceptance (the group screen does the same).
      if (e instanceof Error && e.message === 'rules_acknowledgement_required') {
        router.push(`/community/${group.community_id}/join` as Href);
        return;
      }
      banner.show(errorCopy(e));
    }
  };

  return <Button label={t('join')} size="sm" loading={join.isPending} onPress={onJoin} testID={testID} />;
}
