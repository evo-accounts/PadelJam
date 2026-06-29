import { SUPABASE_URL } from '@/lib/supabase';

/**
 * Call the provision-social-profile edge function to create (or no-op if existing)
 * the profiles row for the currently-signed-in social user.
 * Throws Error('provision_failed') on network or server error.
 */
export async function provisionSocialProfile(
  accessToken: string,
  fullName?: string,
): Promise<void> {
  const body = fullName ? { full_name: fullName } : {};
  const resp = await fetch(
    `${SUPABASE_URL}/functions/v1/provision-social-profile`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error('provision_failed');
}
