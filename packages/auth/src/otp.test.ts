import { describe, it, expect } from 'vitest';
import { otpReducer, initialOtpState } from './otp';

describe('otpReducer', () => {
  it('locks after 5 failed attempts', () => {
    let s = initialOtpState();
    for (let i = 0; i < 5; i++) s = otpReducer(s, { type: 'fail' });
    expect(s.locked).toBe(true);
    expect(s.attempts).toBe(5);
  });
  it('starts a 30s resend cooldown on send', () => {
    const s = otpReducer(initialOtpState(), { type: 'sent', at: 1000 });
    expect(s.cooldownUntil).toBe(1000 + 30_000);
  });
  it('resets attempts on a new send', () => {
    let s = otpReducer(initialOtpState(), { type: 'fail' });
    s = otpReducer(s, { type: 'sent', at: 0 });
    expect(s.attempts).toBe(0);
    expect(s.locked).toBe(false);
  });
});
