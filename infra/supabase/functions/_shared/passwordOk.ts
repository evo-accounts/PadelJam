// UX-GLOB-07. Mirrors apps/mobile/lib/passwordRules.ts and GoTrue's
// `lower_upper_letters_digits_symbols` password_requirements setting (infra/supabase/config.toml).
// Kept free of `jsr:`/`npm:` imports so `pnpm test:functions` can exercise it with plain
// `node --test` — there is no local Deno on this Mac (see the
// padeljam-edge-function-checks memory note); type-checking still goes through
// `docker run denoland/deno:latest deno check` before a push.
export const PASSWORD_OK = (p: string): boolean =>
  p.length >= 8 && /\p{Lu}/u.test(p) && /\d/.test(p) && /[^\p{L}\p{N}]/u.test(p);
