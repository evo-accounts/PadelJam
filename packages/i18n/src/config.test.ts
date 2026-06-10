import { describe, it, expect } from 'vitest';
import { createI18n } from './config';

describe('createI18n', () => {
  it('resolves a pt-PT auth string', async () => {
    const i18n = await createI18n('pt-PT');
    expect(i18n.t('auth:title')).toBe('Entrar ou criar conta');
  });
  it('falls back to en for an unknown locale', async () => {
    const i18n = await createI18n('xx' as never);
    expect(i18n.t('auth:title')).toBe('Login or Sign Up');
  });
});
