import { useSession } from '@padel/auth';
import type { TypedClient } from '@padel/db';

export const useDb = (): TypedClient => useSession().client;

const KNOWN = [
  'owned_community_cap_reached', 'rules_acknowledgement_required', 'invite_required',
  'transfer_ownership_first', 'community_not_found', 'forbidden', 'not_a_member',
  'request_not_found', 'invitation_not_found', 'new_owner_not_member',
] as const;

/** Map a Supabase/Postgres error to a stable code the UI translates via i18n. */
export function mapPgError(error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  const msg = error.message;
  for (const code of KNOWN) if (msg.includes(code)) return code;
  if (msg.includes('members_per_community limit reached')) return 'community_full';
  if (msg.includes('groups_per_community limit reached')) return 'groups_limit_reached';
  if (msg.includes('co_organizers limit reached')) return 'co_organizers_limit_reached';
  return 'unknown_error';
}
