'use client';
import { useParams } from 'next/navigation';
import { GroupMembersList } from '@/components/group/GroupMembersList';

/**
 * Manage members (UX-GRP-12): the Members page reached from Manage group. The same component, not
 * a second page with its own inline "Remove" — an admin's row menu carries the removal there.
 */
export default function GroupManageMembersPage() {
  const { id } = useParams<{ id: string }>();
  return <GroupMembersList groupId={id} />;
}
