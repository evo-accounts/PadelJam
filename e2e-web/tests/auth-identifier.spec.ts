import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for the auth entry (`/auth`).
 *
 *  - "validation (client-side)" never reaches Supabase: a malformed entry is
 *    caught before any request, the way mobile's sign-in catches it. These
 *    tests used to expect GoTrue's raw English rejection, which was the bug —
 *    it cost a rate-limited request and showed users an untranslated message.
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

// Each test waits up to 30s for the form (a cold `next dev` compile), which cannot fit inside
// Playwright's default 30s TEST budget. On a loaded machine every test here failed at that wait
// before reaching a single assertion; each took ~35s on its own once given room.
test.describe.configure({ timeout: 60_000 });

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

/** Stub the OTP send (and its CORS preflight), handing each POST body to `onBody`. */
async function mockOtpSend(
  page: import('@playwright/test').Page,
  onBody: (body: Record<string, unknown>) => void = () => {},
) {
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
    onBody(JSON.parse(req.postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: '{}',
    });
  });
}

/** Count OTP sends that actually leave the page. */
function countOtpSends(page: import('@playwright/test').Page) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (/\/auth\/v1\/otp/.test(r.url()) && r.method() === 'POST') sent.push(r.url());
  });
  return sent;
}

test.describe('auth identifier — validation (client-side)', () => {
  test('a malformed address is marked on the field and never sent', async ({ page }) => {
    const sent = countOtpSends(page);
    await page.goto('/auth');

    // The form renders client-side after i18n loads. Allow extra time for the
    // `next dev` cold compile on first hit.
    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    // Continue is enabled on an empty field: it validates on tap, as mobile does.
    // Scope to the form's submit button — `next dev` injects its own devtools
    // button into the page, so an unscoped button role would be ambiguous.
    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeEnabled();

    await identifier.fill('not-an-email');
    await submit.click();

    // The field is marked, names its own message, and has focus.
    await expect(identifier).toHaveAttribute('aria-invalid', 'true');
    const errorId = await identifier.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    await expect(page.locator(`#${errorId}`)).toContainText(/missing information/i);
    await expect(identifier).toBeFocused();

    // Nothing was sent, and the step did not advance.
    await expect(page.locator(otpField)).toHaveCount(0);
    expect(sent).toHaveLength(0);

    // Typing clears the mark.
    await identifier.fill('not-an-email-yet');
    await expect(identifier).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('digits without an international prefix ask for the international format', async ({ page }) => {
    const sent = countOtpSends(page);
    await page.goto('/auth');
    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    await identifier.fill('912 345 678');
    await page.locator('form button[type="submit"]').click();

    await expect(identifier).toHaveAttribute('aria-invalid', 'true');
    const errorId = await identifier.getAttribute('aria-describedby');
    await expect(page.locator(`#${errorId}`)).toContainText(/international format/i);
    expect(sent).toHaveLength(0);
  });
});

test.describe('auth identifier — OTP transition (mocked send)', () => {
  test('a valid identifier advances to the OTP step', async ({ page }) => {
    await mockOtpSend(page);
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

  // `+351 912 345 678` is how anyone writes a Portuguese number. It used to fail
  // the E.164 check, be sent to the EMAIL endpoint, and come back rejected.
  test('a phone number typed with spaces is sent as E.164 to the phone endpoint', async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await mockOtpSend(page, (b) => bodies.push(b));
    await page.goto('/auth');

    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    await identifier.fill('+351 912 345 678');
    await page.locator('form button[type="submit"]').click();

    await expect(page.locator(otpField)).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.phone).toBe('+351912345678');
    expect(bodies[0]?.email).toBeUndefined();
  });
});
