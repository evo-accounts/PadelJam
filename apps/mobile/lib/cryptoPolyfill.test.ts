import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// expo-crypto is a native module; stub it with recognisable stand-ins so the
// assertions are about *what we install*, not about the hashing.
const digest = vi.fn(async () => new ArrayBuffer(32));
const getRandomValues = vi.fn(<T,>(a: T) => a);
const randomUUID = vi.fn(() => 'uuid-from-expo');

vi.mock('expo-crypto', () => ({
  digest,
  getRandomValues,
  randomUUID,
  CryptoDigestAlgorithm: {
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
  },
}));

const { installCryptoPolyfill, resolveAlgorithm } = await import('./cryptoPolyfill');

// Node defines `crypto`; remove it so each test starts from the RN situation
// unless it says otherwise.
const original = globalThis.crypto;

beforeEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
});

describe('resolveAlgorithm', () => {
  it('accepts both shapes WebCrypto allows', () => {
    expect(resolveAlgorithm('SHA-256')).toBe('SHA-256');
    expect(resolveAlgorithm({ name: 'sha-256' })).toBe('SHA-256');
  });

  it('throws rather than silently hashing with the wrong algorithm', () => {
    expect(() => resolveAlgorithm('MD5')).toThrow(/unsupported algorithm "MD5"/);
  });
});

describe('installCryptoPolyfill', () => {
  it('gives supabase-js everything its PKCE guard checks for', () => {
    installCryptoPolyfill();

    // This is the exact condition in auth-js generatePKCEChallenge; if it is
    // false the challenge method degrades to `plain`.
    const hasCryptoSupport =
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof TextEncoder !== 'undefined';

    expect(hasCryptoSupport).toBe(true);
    // ...and this is what stops the verifier falling back to Math.random().
    expect(typeof crypto.getRandomValues).toBe('function');
  });

  it('routes digest through expo-crypto', async () => {
    installCryptoPolyfill();
    const data = new TextEncoder().encode('hello');
    await crypto.subtle.digest('SHA-256', data);
    expect(digest).toHaveBeenCalledWith('SHA-256', data);
  });

  it('leaves the rest of subtle undefined so callers can feature-detect', () => {
    installCryptoPolyfill();
    expect(crypto.subtle.importKey).toBeUndefined();
    expect(crypto.subtle.sign).toBeUndefined();
  });

  it('does not displace a real implementation', () => {
    const real = { digest: vi.fn(), importKey: vi.fn() };
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: real, getRandomValues: vi.fn(), randomUUID: vi.fn() },
      configurable: true,
    });

    installCryptoPolyfill();

    expect(crypto.subtle).toBe(real);
    expect(crypto.subtle.importKey).toBe(real.importKey);
  });

  it('fills a partial crypto without dropping what was already there', () => {
    const existingGetRandomValues = vi.fn();
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: existingGetRandomValues },
      configurable: true,
    });

    installCryptoPolyfill();

    expect(crypto.getRandomValues).toBe(existingGetRandomValues);
    expect(typeof crypto.subtle.digest).toBe('function');
    expect(crypto.randomUUID()).toBe('uuid-from-expo');
  });

  it('is idempotent', () => {
    installCryptoPolyfill();
    const first = crypto.subtle;
    installCryptoPolyfill();
    expect(crypto.subtle).toBe(first);
  });
});
