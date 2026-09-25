'use client';
import { useParams } from 'next/navigation';
import { GroupCreateForm } from '@/components/group/GroupCreateForm';

/** Create group from a community (UX-GRP-01): the group belongs to this community. */
export default function CommunityGroupCreatePage() {
  const { id } = useParams<{ id: string }>();
  return <GroupCreateForm communityId={id} />;
}
