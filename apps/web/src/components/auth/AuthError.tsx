'use client';

import type { SafeMessage } from '@padel/auth';
import { useT } from '@padel/i18n';

/**
 * The one way an auth step shows a flow error.
 *
 * Each step used to render `flow.error` itself, deciding from its own list of known keys whether
 * the string was a key to translate or a message to print as-is — and the lists disagreed, so the
 * same failure could read as translated copy on one step and raw GoTrue English on the next. The
 * flow now only ever holds a `SafeMessage`, and this renders it. `role="alert"` so it is announced
 * without moving focus; mobile's equivalent is the banner.
 */
export function AuthError({ error }: { error: SafeMessage | null }) {
  const { t } = useT('auth');
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(error.key, { ns: error.ns })}
    </p>
  );
}
