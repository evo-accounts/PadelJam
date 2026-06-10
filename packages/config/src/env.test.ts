import { describe, it, expect } from 'vitest';
import { createPublicEnv } from './env';

describe('createPublicEnv', () => {
  it('parses a valid public env', () => {
    const env = createPublicEnv({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      APP_ENV: 'development',
    });
    expect(env.SUPABASE_URL).toBe('https://abc.supabase.co');
    expect(env.APP_ENV).toBe('development');
  });

  it('throws a clear aggregated error when required vars are missing', () => {
    expect(() => createPublicEnv({})).toThrow(/SUPABASE_URL/);
  });

  it('rejects an invalid URL', () => {
    expect(() =>
      createPublicEnv({ SUPABASE_URL: 'not-a-url', SUPABASE_ANON_KEY: 'k', APP_ENV: 'development' }),
    ).toThrow(/SUPABASE_URL/);
  });
});
