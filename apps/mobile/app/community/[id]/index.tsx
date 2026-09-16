/**
 * `/community/[id]` is no longer a place — it is a redirect.
 *
 * UX-COMM-08 makes the Community TAB the community, with no back button, so a
 * second pushed copy of the same five tabs would contradict the audit and
 * double the surface to maintain. Anything that used to link here (a push
 * notification, a deep link, a card) now switches the tab's active community
 * and lands there instead.
 *
 * A community the user does NOT belong to cannot become their active one, so
 * those go to the join/preview screen — which is the correct destination for a
 * non-member anyway, and the screen UX-COMM-05 rebuilds in the next pull
 * request.
 */
import { useCommunities, useSetDefaultCommunity } from '@padel/api';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Loading } from '../../../components/ui';

export default function CommunityRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, isLoading } = useCommunities();
  const setDefault = useSetDefaultCommunity();
  const [switched, setSwitched] = useState(false);

  const membership = (rows ?? []).find((r) => r.community?.id === id);
  const isMember = !!membership && !membership.community?.archived_at;

  useEffect(() => {
    if (!id || !isMember || switched) return;
    // Make it the tab's community, then hand over. Failing to record the choice
    // is not worth blocking navigation for — the tab still opens, on whatever
    // community was active before.
    void setDefault.mutateAsync(id).catch(() => {}).finally(() => setSwitched(true));
  }, [id, isMember, switched, setDefault]);

  if (!id) return <Redirect href="/(tabs)/community" />;
  if (isLoading) return <Loading />;
  if (!isMember) return <Redirect href={`/community/${id}/join`} />;
  if (!switched) return <Loading />;
  return <Redirect href="/(tabs)/community" />;
}
