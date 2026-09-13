import * as Crypto from 'expo-crypto';

/**
 * Install a minimal WebCrypto global so PKCE is actually PKCE.
 *
 * Hermes ships no WebCrypto, React Native installs none, and Expo's WinterCG
 * runtime (`expo/src/winter/runtime.native.ts`) installs TextDecoder/URL/fetch
 * but not `crypto`. `expo-crypto` is a plain module — importing it does not
 * define a global. So `globalThis.crypto` is undefined in this app, and
 * supabase-js degrades in TWO places rather than one:
 *
 *     // generatePKCEVerifier — the verifier is the secret
 *     if (typeof crypto === 'undefined') {
 *       ... verifier += charSet.charAt(Math.floor(Math.random() * charSetLen))
 *     }
 *     crypto.getRandomValues(array)
 *
 *     // generatePKCEChallenge — the challenge is the public commitment
 *     typeof crypto.subtle !== 'undefined' && ...
 *     console.warn('WebCrypto API is not supported. Code challenge method will
 *                   default to use plain instead of sha256.')
 *
 * Production Supabase logs confirmed the degraded path was live — every Google
 * authorize request carried `code_challenge_method=plain`. The `Math.random()`
 * verifier is the worse half of that and left no trace in the logs at all: a
 * predictable verifier defeats PKCE even when the challenge method is S256.
 *
 * Both come from the one missing global, so both are fixed here.
 *
 * Only `getRandomValues`, `randomUUID` and `subtle.digest` are implemented.
 * The rest of `subtle` is deliberately left undefined rather than stubbed to
 * throw: callers feature-detect (`typeof crypto.subtle.importKey === 'function'`)
 * and a missing method lets them fall back cleanly, where a throwing one would
 * crash them. This is a shim for one known consumer, not a WebCrypto
 * implementation, and it should not pretend otherwise.
 *
 * `app/_layout.tsx` imports this first, ahead of anything that reaches the
 * Supabase client. Both reads are lazy — they happen when a sign-in builds its
 * challenge, not at module load — but importing first keeps the guarantee
 * independent of import order elsewhere.
 */

const ALGORITHMS: Record<string, Crypto.CryptoDigestAlgorithm> = {
  'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
};

/** Normalises both call shapes WebCrypto accepts: `'SHA-256'` and `{ name }`. */
export function resolveAlgorithm(
  algorithm: string | { name: string },
): Crypto.CryptoDigestAlgorithm {
  const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
  const mapped = ALGORITHMS[name];
  if (!mapped) throw new Error(`crypto.subtle.digest: unsupported algorithm "${name}"`);
  return mapped;
}

type PartialCrypto = {
  getRandomValues?: unknown;
  randomUUID?: unknown;
  subtle?: { digest?: unknown };
};

export function installCryptoPolyfill(): void {
  const g = globalThis as typeof globalThis & { crypto?: PartialCrypto };

  // Fill in only what is missing: if the runtime ever grows a real
  // implementation, it wins.
  const target: PartialCrypto = g.crypto ?? {};

  if (typeof target.getRandomValues !== 'function') {
    define(target, 'getRandomValues', Crypto.getRandomValues);
  }

  if (typeof target.randomUUID !== 'function') {
    define(target, 'randomUUID', Crypto.randomUUID);
  }

  if (typeof target.subtle?.digest !== 'function') {
    const digest = (algorithm: string | { name: string }, data: BufferSource): Promise<ArrayBuffer> =>
      Crypto.digest(resolveAlgorithm(algorithm), data);
    define(target, 'subtle', { ...target.subtle, digest });
  }

  if (!g.crypto) define(g, 'crypto', target);
}

/**
 * `configurable` so a later real polyfill can still replace this, and
 * non-enumerable to match how engines expose their own globals.
 */
function define(object: object, key: string, value: unknown): void {
  Object.defineProperty(object, key, { value, configurable: true, writable: true });
}

installCryptoPolyfill();
