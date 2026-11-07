import * as Sentry from '@sentry/nextjs';
import { createPublicEnv } from '@padel/config';
import { scrubBreadcrumb, scrubTransaction } from '@padel/utils';

/**
 * Minimal, DSN-guarded Sentry init for the browser/client.
 *
 * NOTE: Full server/edge instrumentation (sentry.server.config.ts,
 * instrumentation.ts, withSentryConfig) and source-map upload are deferred to a
 * later task. Those require a real Sentry DSN and a SENTRY_AUTH_TOKEN, and
 * coupling them into the build risks breaking `next build` without that config.
 * This file intentionally only performs a client-side `Sentry.init` when a DSN
 * is present, and is a complete no-op otherwise.
 */
let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const env = createPublicEnv({
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  if (!env.SENTRY_DSN) return; // no-op locally / without a DSN
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.APP_ENV, tracesSampleRate: 0.1,
    // Whole query strings go: PostgREST filters (id=eq.<uuid>, user_id=, email=) and Stream's own queries.
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
    beforeSendTransaction: (e) => scrubTransaction(e),
  });
  initialized = true;
}
