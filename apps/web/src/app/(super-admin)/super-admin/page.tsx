import { redirect } from 'next/navigation';

/** The venue registry is the only super-admin tool so far. */
export default function SuperAdminHome() {
  redirect('/super-admin/venues');
}
