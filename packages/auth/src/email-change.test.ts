import { describe, it, expect, vi } from 'vitest';
import { startEmailChange, verifyEmailChange } from './otp';
import type { TypedClient } from '@padel/db';

const makeClient = () => {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
  return { client: { auth: { updateUser, verifyOtp } } as unknown as TypedClient, updateUser, verifyOtp };
};

describe('email change helpers', () => {
  it('startEmailChange calls updateUser with the new email', async () => {
    const { client, updateUser } = makeClient();
    await startEmailChange(client, 'new@x.com');
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@x.com' });
  });
  it('verifyEmailChange calls verifyOtp with type email_change', async () => {
    const { client, verifyOtp } = makeClient();
    await verifyEmailChange(client, 'new@x.com', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'new@x.com', token: '123456', type: 'email_change' });
  });
});
