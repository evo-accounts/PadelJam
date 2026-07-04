import { describe, it, expect, vi } from 'vitest';
import { startPhoneChange, verifyPhoneChange } from './otp';
import type { TypedClient } from '@padel/db';

const makeClient = () => {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
  return { client: { auth: { updateUser, verifyOtp } } as unknown as TypedClient, updateUser, verifyOtp };
};

describe('phone change helpers', () => {
  it('startPhoneChange calls updateUser with the new phone', async () => {
    const { client, updateUser } = makeClient();
    await startPhoneChange(client, '+351912345678');
    expect(updateUser).toHaveBeenCalledWith({ phone: '+351912345678' });
  });
  it('verifyPhoneChange calls verifyOtp with type phone_change', async () => {
    const { client, verifyOtp } = makeClient();
    await verifyPhoneChange(client, '+351912345678', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '+351912345678', token: '123456', type: 'phone_change' });
  });
});
