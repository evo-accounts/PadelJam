/**
 * What the "Try another way" sheet actually lists, as data (UX-AUTH-04).
 *
 * Split out of the sheet the way `codeInput.ts` is split out of `CodeField` and
 * `topBarLayout.ts` out of `TopBar`: the interesting part — which rows exist and
 * what identifier each one names — is pure, and the vitest project runs in the
 * `node` environment, so nothing that imports `react-native` can be tested at
 * all. This can.
 *
 * The ORDER and the MEMBERSHIP are `availableMethods`' job, not this module's.
 * All that happens here is attaching the masked identifier a row should show.
 */
import { availableMethods, type AuthMethod, type AuthMethods } from '@/lib/authMethods';
import { formatMaskedPhone } from '@/lib/countries';

/** The `auth`-namespace key each row's label comes from. */
export type TryAnotherWayLabelKey =
  | 'useSms'
  | 'useEmailCode'
  | 'usePassword'
  | 'continueWithGoogle'
  | 'continueWithApple';

export type TryAnotherWayRow = {
  method: AuthMethod;
  labelKey: TryAnotherWayLabelKey;
  /**
   * The MASKED identifier the row names, ready to interpolate — '(+351) •••••
   * 5678' or 'j•••@gmail.com'. Empty for the rows that name no identifier
   * (password, Google, Apple) and, deliberately, for a channel the server
   * reported as present but could not mask. An unmasked row is not an option:
   * the whole point of masking in SQL is that the raw value never reaches here,
   * so a missing mask means the row shows the method and not the identifier.
   */
  identifier: string;
};

const LABEL_KEY: Record<AuthMethod, TryAnotherWayLabelKey> = {
  sms: 'useSms',
  email: 'useEmailCode',
  password: 'usePassword',
  google: 'continueWithGoogle',
  apple: 'continueWithApple',
};

const identifierFor = (method: AuthMethod, m: AuthMethods): string => {
  if (method === 'sms') return m.phoneMasked ? formatMaskedPhone(m.phoneMasked) : '';
  if (method === 'email') return m.emailMasked ?? '';
  return '';
};

/**
 * The sheet's rows for one account.
 *
 * `null` methods — a lookup still in flight, a lookup that failed, or a lookup
 * that found nothing — all produce NO ROWS, which is the same answer an account
 * whose only method is the one already in use gives. That sameness is the
 * security property from migration 0096, so it is preserved here rather than
 * worked around: the caller cannot tell the cases apart either, and must render
 * one empty state for all of them.
 */
export function tryAnotherWayRows(
  methods: AuthMethods | null,
  inUse: AuthMethod,
): TryAnotherWayRow[] {
  if (!methods) return [];
  return availableMethods(methods, inUse).map((method) => ({
    method,
    labelKey: LABEL_KEY[method],
    identifier: identifierFor(method, methods),
  }));
}
