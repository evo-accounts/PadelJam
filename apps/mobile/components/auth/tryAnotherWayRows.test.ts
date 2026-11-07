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
  it('never offers an SMS row, even when the account has a phone (PAD-137)', () => {
    const rows = tryAnotherWayRows(
      methods({ hasEmail: true, hasPhone: true, phoneMasked: '+351•••••5678' }),
      'email',
    );
    expect(rows).toEqual([]);
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

  it('produces no rows for a null lookup, exactly as for an account with nothing else', () => {
    // In flight, failed, and unknown-identifier are one case on purpose (0096).
    expect(tryAnotherWayRows(null, 'email')).toEqual([]);
    expect(tryAnotherWayRows(NONE, 'email')).toEqual([]);
    expect(tryAnotherWayRows(methods({ hasEmail: true, emailMasked: 'j•••@x.com' }), 'email')).toEqual([]);
  });
});
