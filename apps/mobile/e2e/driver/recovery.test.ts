import { describe, expect, it, vi } from 'vitest';
import { recoverAfterFailure } from './recovery';

describe('recoverAfterFailure', () => {
  it('relaunches after a failed test and logs one line', async () => {
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();
    expect(await recoverAfterFailure(true, 't', relaunch, warn)).toBe(true);
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing after a pass', async () => {
    const relaunch = vi.fn();
    expect(await recoverAfterFailure(false, 't', relaunch, vi.fn())).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('swallows a failed relaunch', async () => {
    const warn = vi.fn();
    const relaunch = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(recoverAfterFailure(true, 't', relaunch, warn)).resolves.toBe(false);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('boom'));
  });
});
