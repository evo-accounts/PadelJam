import { describe, it, expect, vi } from 'vitest';
import { changePassword, signInWithPassword, setPassword } from './password';
import { primaryCredential } from './password';
import type { TypedClient } from '@padel/db';

const makeClient = (signInErr: unknown, updateErr: unknown) => {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: signInErr });
  const updateUser = vi.fn().mockResolvedValue({ error: updateErr });
  return { client: { auth: { signInWithPassword, updateUser } } as unknown as TypedClient, signInWithPassword, updateUser };
};

describe('changePassword', () => {
  it('verifies current then updates, returning ok', async () => {
    const { client, signInWithPassword, updateUser } = makeClient(null, null);
    const r = await changePassword(client, 'a@x.com', 'old', 'newpassword');
    expect(r).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.com', password: 'old' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });

  it('returns current_password_wrong and does not update when current is wrong', async () => {
    const { client, updateUser } = makeClient({ message: 'invalid' }, null);
    const r = await changePassword(client, 'a@x.com', 'bad', 'newpassword');
    expect(r).toEqual({ ok: false, reason: 'current_password_wrong' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns update_failed when the update errors', async () => {
    const { client } = makeClient(null, { message: 'weak' });
    const r = await changePassword(client, 'a@x.com', 'old', 'newpassword');
    expect(r).toEqual({ ok: false, reason: 'update_failed' });
  });
});

it('signInWithPassword uses email for email kind', async () => {
  const signIn = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { signInWithPassword: signIn } } as unknown as TypedClient;
  await signInWithPassword(c, 'a@x.com', 'email', 'pw12345678');
  expect(signIn).toHaveBeenCalledWith({ email: 'a@x.com', password: 'pw12345678' });
});

it('signInWithPassword uses phone for phone kind', async () => {
  const signIn = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { signInWithPassword: signIn } } as unknown as TypedClient;
  await signInWithPassword(c, '+351900000001', 'phone', 'pw12345678');
  expect(signIn).toHaveBeenCalledWith({ phone: '+351900000001', password: 'pw12345678' });
});

it('setPassword calls updateUser with the new password', async () => {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { updateUser } } as unknown as TypedClient;
  await setPassword(c, 'newpw12345');
  expect(updateUser).toHaveBeenCalledWith({ password: 'newpw12345' });
});

describe('primaryCredential', () => {
  it('uses email when the primary kind is email', () => {
    expect(primaryCredential({ primaryKind: 'email', email: 'a@b.com', phone: '+351900000000' }))
      .toEqual({ identifier: 'a@b.com', kind: 'email' });
  });
  it('uses phone when the primary kind is phone', () => {
    expect(primaryCredential({ primaryKind: 'phone', email: 'a@b.com', phone: '+351900000000' }))
      .toEqual({ identifier: '+351900000000', kind: 'phone' });
  });
  it('returns null when the chosen identifier is missing', () => {
    expect(primaryCredential({ primaryKind: 'email', email: null, phone: '+351900000000' })).toBeNull();
    expect(primaryCredential({ primaryKind: 'phone', email: 'a@b.com', phone: undefined })).toBeNull();
  });
});
