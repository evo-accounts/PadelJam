import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type NotificationSettings = {
  notifications_push: boolean;
  notifications_whatsapp: boolean;
  notifications_email: boolean;
};

// In-app defaults for the no-row case; keep in sync with the column defaults in
// migration 0057_user_settings.sql (push on, whatsapp/email off).
const DEFAULTS: NotificationSettings = {
  notifications_push: true,
  notifications_whatsapp: false,
  notifications_email: false,
};

export const useMySettings = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.mySettings(uid ?? ''),
    enabled: !!uid,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await db
        .from('user_settings')
        .select('notifications_push, notifications_whatsapp, notifications_email')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULTS;
    },
  });
};

/**
 * Which ways the SIGNED-IN user can get back into this account. Calls `my_auth_providers()`
 * (migration 0132, which replaced the `auth_providers` view the Supabase advisor flagged): a
 * SECURITY DEFINER function over auth.users/auth.identities scoped to `auth.uid()`, so it never
 * answers for anyone but the caller and it carries booleans only.
 *
 * `has_password` is the one the settings screen turns on. A Google or Apple sign-up has no
 * password at all — the Change Password screen's re-auth step can only ever fail for them — so
 * the row has to know which of the two screens it is opening before it is labelled.
 *
 * The function answers with no row at all when there is no session (or no auth.users row behind
 * it), so the whole shape is coerced here rather than leaving `undefined | false` to be
 * re-disambiguated at each call site.
 */
export type AuthProviders = {
  has_password: boolean;
  has_email: boolean;
  has_phone: boolean;
  has_google: boolean;
  has_apple: boolean;
};

export const useAuthProviders = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.authProviders(uid ?? ''),
    enabled: !!uid,
    queryFn: async (): Promise<AuthProviders> => {
      const { data, error } = await db.rpc('my_auth_providers').maybeSingle();
      if (error) throw error;
      return {
        has_password: data?.has_password === true,
        has_email: data?.has_email === true,
        has_phone: data?.has_phone === true,
        has_google: data?.has_google === true,
        has_apple: data?.has_apple === true,
      };
    },
  });
};
