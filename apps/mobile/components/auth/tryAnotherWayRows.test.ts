import { describe, expect, it } from 'vitest';

import type { AuthMethods } from '@/lib/authMethods';
import { tryAnotherWayRows } from './tryAnotherWayRows';

const NONE: AuthMethods = {
  hasEmail: false,
  hasPhone: false,
  hasGoogle: false,
  hasApple: false,
  hasPassword: false,
  emailMasked: null,
  phoneMasked: null,
};
const methods = (over: Partial<AuthMethods>): AuthMethods => ({ ...NONE, ...over });

describe('tryAnotherWayRows', () => {
  it('names the SMS row with the masked number, typeset', () => {
    const rows = tryAnotherWayRows(
      methods({ hasEmail: true, hasPhone: true, phoneMasked: '+351•••••5678' }),
      'email',
    );
    expect(rows).toEqual([{ method: 'sms', labelKey: 'useSms', identifier: '(+351) ••••• 5678' }]);
  });

  it('names the email row with the masked address as the server sent it', () => {
    const rows = tryAnotherWayRows(
      methods({ hasEmail: true, hasPhone: true, emailMasked: 'j•••@gmail.com' }),
      'sms',
    );
    expect(rows).toEqual([{ method: 'email', labelKey: 'useEmailCode', identifier: 'j•••@gmail.com' }]);
  });

  it('leaves the identifier empty on rows that name no identifier', () => {
    const rows = tryAnotherWayRows(
      methods({ hasEmail: true, hasPassword: true, hasGoogle: true, hasApple: true }),
      'email',
    );
    expect(rows.map((r) => [r.method, r.labelKey, r.identifier])).toEqual([
      ['password', 'usePassword', ''],
      ['google', 'continueWithGoogle', ''],
      ['apple', 'continueWithApple', ''],
    ]);
  });

  it('shows the method without an identifier when the server could not mask it', () => {
    // mask_phone returns null for a number it will not guess at; the row must
    // still exist (the account HAS a phone) and must not print 'null'.
    const rows = tryAnotherWayRows(methods({ hasPhone: true, hasEmail: true }), 'email');
    expect(rows).toEqual([{ method: 'sms', labelKey: 'useSms', identifier: '' }]);
  });

  it('produces no rows for a null lookup, exactly as for an account with nothing else', () => {
    // In flight, failed, and unknown-identifier are one case on purpose (0096).
    expect(tryAnotherWayRows(null, 'email')).toEqual([]);
    expect(tryAnotherWayRows(NONE, 'email')).toEqual([]);
    expect(tryAnotherWayRows(methods({ hasEmail: true, emailMasked: 'j•••@x.com' }), 'email')).toEqual([]);
  });
});
