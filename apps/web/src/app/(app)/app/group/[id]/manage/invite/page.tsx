import { redirect } from 'next/navigation';

/** Invite moved to /app/group/[id]/invite (UX-GRP-08); old links still land there. */
export default async function GroupManageInviteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/group/${id}/invite`);
}
