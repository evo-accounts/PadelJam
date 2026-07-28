import { homedir } from 'node:os';
import { join } from 'node:path';

/** Central runtime config for the E2E driver. Everything overridable via env. */
export const CONFIG = {
  udid: process.env.E2E_UDID ?? '5D4B52E5-ED02-46F7-94FD-FEB1A3F52877',
  bundleId: 'app.padeljam',
  /** DEVELOPER_DIR for xcrun on hosts where xcode-select points at CommandLineTools. */
  developerDir: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer',
  idbPath: process.env.E2E_IDB_PATH ?? join(homedir(), 'Library/Python/3.9/bin/idb'),
  artifactsDir: process.env.E2E_ARTIFACTS_DIR ?? join(__dirname, '..', 'artifacts', 'local'),
  supabaseUrl: process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:55321',
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55324',
  dbContainer: process.env.E2E_DB_CONTAINER ?? 'supabase_db_padeljam',
  /** Feature flags for locally-blocked areas. */
  flags: {
    stream: process.env.E2E_STREAM === '1',
    oauth: process.env.E2E_OAUTH === '1',
    pushDelivery: process.env.E2E_PUSH_DELIVERY === '1',
  },
  /** Default waitFor timeout/poll interval (ms). */
  waitTimeoutMs: Number(process.env.E2E_WAIT_TIMEOUT_MS ?? 15_000),
  pollIntervalMs: 400,
} as const;
