import { redirect } from 'next/navigation';

/**
 * The old Manage hub. Its rows now live in the group page's settings menu (UX-GRP-10), so an old
 * link or bookmark lands on the group page, where that menu is.
 */
export default async function GroupManageRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/group/${id}`);
}
