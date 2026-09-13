import { describe, expect, it } from 'vitest';

import { availableMethods, type AuthMethods } from './authMethods';

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

describe('availableMethods', () => {
  it('offers nothing when the account has no methods at all', () => {
    // Also the unknown-identifier case: auth_methods_for returns all-false for both.
    expect(availableMethods(NONE, 'email')).toEqual([]);
  });

  it('offers the phone and the password when email is the one in use', () => {
    const m = methods({ hasEmail: true, hasPhone: true, hasPassword: true, phoneMasked: '+351•••••5678' });
    expect(availableMethods(m, 'email')).toEqual(['sms', 'password']);
  });

  it('leaves out the password row when the account has no password', () => {
    const m = methods({ hasEmail: true, hasPhone: true, hasGoogle: true });
    expect(availableMethods(m, 'sms')).toEqual(['email', 'google']);
  });

  it('always removes the method in use, even when it is the only one', () => {
    expect(availableMethods(methods({ hasPhone: true }), 'sms')).toEqual([]);
    expect(availableMethods(methods({ hasGoogle: true }), 'google')).toEqual([]);
  });

  it('orders sms, email, password, google, apple whatever the flags say', () => {
    const all = methods({
      hasEmail: true,
      hasPhone: true,
      hasGoogle: true,
      hasApple: true,
      hasPassword: true,
    });
    expect(availableMethods(all, 'sms')).toEqual(['email', 'password', 'google', 'apple']);
    expect(availableMethods(all, 'apple')).toEqual(['sms', 'email', 'password', 'google']);
    // Order does not depend on which method is removed.
    expect(availableMethods(all, 'password')).toEqual(['sms', 'email', 'google', 'apple']);
  });
});
