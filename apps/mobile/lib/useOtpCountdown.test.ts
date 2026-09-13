import { RESEND_COOLDOWN_MS } from '@padel/auth';
import { describe, expect, it } from 'vitest';
import { otpRemaining } from './useOtpCountdown';

const NOW = 1_700_000_000_000;

describe('otpRemaining', () => {
  it('is the full cooldown the instant a code is sent', () => {
    expect(otpRemaining(NOW + RESEND_COOLDOWN_MS, NOW)).toBe(RESEND_COOLDOWN_MS / 1000);
  });

  it('rounds UP, so the countdown never skips a number or reaches 0 early', () => {
    expect(otpRemaining(NOW + 29_400, NOW)).toBe(30);
    expect(otpRemaining(NOW + 1, NOW)).toBe(1);
  });

  it('is 0 exactly on the boundary', () => {
    expect(otpRemaining(NOW, NOW)).toBe(0);
  });

  it('is 0, never negative, once the cooldown has passed', () => {
    expect(otpRemaining(NOW - 5_000, NOW)).toBe(0);
  });

  it('is 0 for the initial state, whose cooldown is unset', () => {
    expect(otpRemaining(0, NOW)).toBe(0);
  });
});
