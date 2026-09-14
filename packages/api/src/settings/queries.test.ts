import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('settings query keys', () => {
  it('mySettings shape', () => {
    expect(qk.mySettings('u1')).toEqual(['user-settings', 'u1']);
  });

  it('authProviders shape', () => {
    expect(qk.authProviders('u1')).toEqual(['auth-providers', 'u1']);
  });

  it('authProviders is namespaced per user, so a sign-out/sign-in cannot serve the previous account', () => {
    expect(qk.authProviders('u1')).not.toEqual(qk.authProviders('u2'));
  });
});
