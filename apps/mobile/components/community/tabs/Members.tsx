/**
 * The Members tab. The roster itself is `MembersList`, shared with Manage
 * Members (UX-COMM-19) — the tab is that list with no chrome of its own, since
 * the community header is already above it.
 */
import { useCommunityId } from '@/components/community/CommunityIdContext';
import { MembersList } from '@/components/community/MembersList';

export default function CommunityMembersScreen() {
  const id = useCommunityId();
  return <MembersList communityId={id} />;
}
