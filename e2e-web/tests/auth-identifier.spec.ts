import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for the auth entry (`/auth`).
 *
 *  - "validation (real Supabase)" hits the LOCAL Supabase stack so the
 *    assertion exercises GoTrue's actual identifier validation.
 *  - "OTP transition (mocked send)" stubs the OTP request. The local stack has
 *    no mail delivery — signInWithOtp on a *valid* email 500s ("Error sending
 *    magic link email") — so a real send can't advance the UI here. We fulfill
 *    the request with a 200 to drive the identifier -> OTP transition
 *    deterministically, with zero email/SMS side effects.
 *
 * Both require the stack running (`supabase start`); the health precheck below
 * fails fast with an actionable message when it isn't. The Playwright webServer
 * boots `next dev` but not Supabase.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'http://localhost:55321';

// Selectors keyed off autocomplete so they survive i18n copy changes and
// distinguish the two steps (both fields render as role="textbox").
const identifierField = 'input[autocomplete="username"]';
const otpField = 'input[autocomplete="one-time-code"]';

test.beforeAll(async () => {
  let healthy = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  if (!healthy) {
    throw new Error(
      `Local Supabase auth is not reachable at ${SUPABASE_URL}. ` +
        'Start the local stack with `supabase start` before running this test.',
    );
  }
});

test.describe('auth identifier — validation (real Supabase)', () => {
  test('rejects a malformed identifier and stays on the identifier step', async ({ page }) => {
    await page.goto('/auth');

    // The form renders client-side after i18n loads. Allow extra time for the
    // `next dev` cold compile on first hit.
    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    await identifier.fill('not-an-email');
    // Scope to the form's submit button — `next dev` injects its own devtools
    // button into the page, so an unscoped button role would be ambiguous.
    await page.locator('form button[type="submit"]').click();

    // GoTrue rejects the malformed email; useAuthFlow stores error.message and
    // IdentifierStep renders it in the alert paragraph. Scope to the form so we
    // don't match Next's empty page-level route announcer (also role="alert").
    const alert = page.locator('form').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid|validate/i);

    // No advance to the OTP step: still on /auth with the identifier field shown.
    await expect(page).toHaveURL(/\/auth$/);
    await expect(identifier).toBeVisible();
    await expect(page.locator(otpField)).toHaveCount(0);
  });
});

test.describe('auth identifier — OTP transition (mocked send)', () => {
  test('a valid identifier advances to the OTP step', async ({ page }) => {
    // Replace the OTP send with a success so the flow advances despite the
    // stack having no mail delivery. Cover the CORS preflight too, since the
    // request is cross-origin (app :3100 -> Supabase :55321).
    await page.route(/\/auth\/v1\/otp/, async (route) => {
      const req = route.request();
      const cors: Record<string, string> = {
        'access-control-allow-origin': req.headers()['origin'] ?? '*',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers':
          req.headers()['access-control-request-headers'] ??
          'authorization, apikey, content-type, x-client-info',
      };
      if (req.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: '{}',
      });
    });

    await page.goto('/auth');

    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    await identifier.fill('player@example.com');
    await page.locator('form button[type="submit"]').click();

    // The OTP step renders its 6-digit one-time-code field, and the identifier
    // field is gone — we've left the identifier step.
    await expect(page.locator(otpField)).toBeVisible();
    await expect(identifier).toHaveCount(0);
    await expect(page).toHaveURL(/\/auth$/);
  });
});
