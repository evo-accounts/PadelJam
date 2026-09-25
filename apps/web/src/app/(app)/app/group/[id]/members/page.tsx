'use client';
import { useParams } from 'next/navigation';
import { GroupMembersList } from '@/components/group/GroupMembersList';

/** Members (UX-GRP-07) — the same component as Manage members (UX-GRP-12). */
export default function GroupMembersPage() {
  const { id } = useParams<{ id: string }>();
  return <GroupMembersList groupId={id} />;
}
