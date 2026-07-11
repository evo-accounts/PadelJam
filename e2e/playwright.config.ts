import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for PadelJam end-to-end tests.
 * See https://playwright.dev/docs/test-configuration
 *
 * Base URL points at the local `web` app. We run it on a dedicated port
 * (3100, override with WEB_PORT) rather than the default 3000 so the suite
 * never collides with a dev server a developer already has running.
 * Override BASE_URL to run against a deployed environment, e.g.
 *   BASE_URL=https://padeljam.app pnpm --filter @padel/e2e test:e2e
 */
const WEB_PORT = process.env.WEB_PORT ?? '3100';
const baseURL = process.env.BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /*
   * Boot the local `web` dev server before the tests and reuse it if one is
   * already running. `next dev` reads apps/web/.env.local, which points the
   * Supabase client at the local stack (http://localhost:55321). Tests that hit
   * the backend (e.g. auth-identifier.spec.ts) additionally need that stack up
   * — start it with `supabase start`.
   */
  webServer: {
    command: `pnpm --filter web exec next dev --port ${WEB_PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
