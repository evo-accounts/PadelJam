import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthMethods } from './authMethods';
import { clearAuthTarget, detectKind, getAuthTarget, setAuthMethods, setAuthTarget } from './auth-flow';

const METHODS: AuthMethods = {
  hasEmail: true,
  hasPhone: true,
  hasGoogle: false,
  hasApple: false,
  hasPassword: true,
  emailMasked: 'm***@example.com',
  phoneMasked: '+351 *** *** 678',
};

describe('auth-flow target', () => {
  beforeEach(() => clearAuthTarget());

  it('records the entry input alongside the channel', () => {
    setAuthTarget('+351912345678', 'phone', 'phone');
    expect(getAuthTarget()).toMatchObject({ identifier: '+351912345678', kind: 'phone', entry: 'phone' });
  });

  it('defaults entry to the channel for callers that do not have an input', () => {
    setAuthTarget('a@b.com', 'email');
    expect(getAuthTarget().entry).toBe('email');
  });

  it('starts a new target with no methods, so the previous account\'s cannot leak into it', () => {
    setAuthTarget('a@b.com', 'email');
    setAuthMethods('a@b.com', METHODS);
    setAuthTarget('c@d.com', 'email');
    expect(getAuthTarget().methods).toBeNull();
  });

  it('attaches a lookup result to the target it was made for', () => {
    setAuthTarget('a@b.com', 'email');
    setAuthMethods('a@b.com', METHODS);
    expect(getAuthTarget().methods).toEqual(METHODS);
  });

  /**
   * The lookup is fired alongside the OTP send and resolves whenever it
   * resolves. Going back and signing in as someone else in the meantime must not
   * end with the FIRST account's methods offered for the second.
   */
  it('drops a lookup that resolves after the target changed', () => {
    setAuthTarget('a@b.com', 'email');
    setAuthTarget('c@d.com', 'email');
    setAuthMethods('a@b.com', METHODS);
    expect(getAuthTarget().methods).toBeNull();
  });

  it('clears back to an empty target', () => {
    setAuthTarget('+351912345678', 'phone');
    setAuthMethods('+351912345678', METHODS);
    clearAuthTarget();
    expect(getAuthTarget()).toEqual({ identifier: '', kind: 'email', entry: 'email', methods: null });
  });
});

describe('detectKind', () => {
  // Kept for create-account's secondary identifier; sign-in no longer guesses.
  it('reads E.164 as a phone', () => expect(detectKind(' +351912345678 ')).toBe('phone'));
  it('reads a local-format number as an email, which is why sign-in stopped using it', () =>
    expect(detectKind('912345678')).toBe('email'));
  it('reads an address as an email', () => expect(detectKind('a@b.com')).toBe('email'));
});
