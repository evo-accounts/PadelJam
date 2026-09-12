import { describe, expect, it } from 'vitest';
import { safeAuthMessage } from './authErrors';

describe('safeAuthMessage', () => {
  it('passes through safe, non-enumerating codes', () => {
    expect(safeAuthMessage(new Error('invalid_code'))).toEqual({ ns: 'auth', key: 'invalidCode' });
    expect(safeAuthMessage(new Error('Token has expired or is invalid'))).toEqual({ ns: 'auth', key: 'invalidCode' });
  });
  it('hides everything that could confirm an identifier exists', () => {
    expect(safeAuthMessage(new Error('User not found'))).toEqual({ ns: 'common', key: 'somethingWrong' });
    expect(safeAuthMessage(new Error('Invalid login credentials'))).toEqual({ ns: 'common', key: 'somethingWrong' });
    expect(safeAuthMessage(null)).toEqual({ ns: 'common', key: 'somethingWrong' });
  });
  it('names network and rate-limit problems', () => {
    expect(safeAuthMessage(new Error('Network request failed'))).toEqual({ ns: 'auth', key: 'networkError' });
    expect(safeAuthMessage(new Error('over_email_send_rate_limit'))).toEqual({ ns: 'auth', key: 'rateLimited' });
  });
  it('recognizes Supabase cooldown text as rate limiting', () => {
    expect(safeAuthMessage(new Error('For security purposes, you can only request this after 57 seconds.'))).toEqual({
      ns: 'auth',
      key: 'rateLimited',
    });
  });
  it('does not let a bare "otp" substring or account-existence text pass as a safe code error', () => {
    expect(safeAuthMessage(new Error('User already registered'))).toEqual({ ns: 'common', key: 'somethingWrong' });
    expect(safeAuthMessage(new Error('Signups not allowed for this instance'))).toEqual({
      ns: 'common',
      key: 'somethingWrong',
    });
    expect(safeAuthMessage(new Error('otp_disabled'))).toEqual({ ns: 'common', key: 'somethingWrong' });
  });
});
