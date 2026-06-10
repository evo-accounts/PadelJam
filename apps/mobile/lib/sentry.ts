import * as Sentry from '@sentry/react-native';
import { createPublicEnv } from '@padel/config';

/**
 * Minimal, DSN-guarded Sentry init for the mobile app.
 *
 * NOTE: Native wiring (the @sentry/react-native Expo config plugin, native
 * prebuild, and source-map upload) is deferred to a later native task. Those
 * require a real Sentry DSN and a SENTRY_AUTH_TOKEN and a native build. This
 * file only performs a guarded JS `Sentry.init` when a DSN is present, and is a
 * complete no-op otherwise.
 */
let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const env = createPublicEnv({
    SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  });
  if (!env.SENTRY_DSN) return; // no-op locally / without a DSN
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.APP_ENV, tracesSampleRate: 0.1 });
  initialized = true;
}
