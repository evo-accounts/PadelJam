import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for the auth entry (`/auth`).
 *
 *  - "validation (client-side)" never reaches Supabase: a malformed entry is
 *    caught before any request, the way mobile's sign-in catches it. These
 *    tests used to expect GoTrue's raw English rejection, which was the bug —
 *    it cost a rate-limited request and showed users an untranslated message.
 *  - "OTP transition (mocked send)" stubs the OTP request to drive the identifier -> OTP
 *    transition deterministically, with no email side effects.
 *  - "sign-up" uses the real send: the local stack delivers mail to Mailpit, so the test reads the
 *    code from there and creates a real account.
 *
 * Phone sign-in is hidden for launch (PAD-137): a phone number is not an identifier, so typing one
 * is "missing information" and never reaches the OTP endpoint.
 *
 * Both require the local stack, started through the stack slots as e2e-web/README.md says (point
 * `apps/web/.env.local` at it, and `E2E_MAILPIT_URL` at its Mailpit); the health precheck below
 * fails fast with an actionable message when it isn't. The Playwright webServer boots `next dev`
 * but not Supabase.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'http://localhost:55321';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55324';

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
        'Start the local stack as e2e-web/README.md says before running this test.',
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

  // Criterion 1: phone sign-in is gone, with or without the international prefix.
  for (const phone of ['912 345 678', '+351 912 345 678']) {
    test(`a phone number (${phone}) is marked as missing information and never sent`, async ({ page }) => {
      const sent = countOtpSends(page);
      await page.goto('/auth');
      const identifier = page.locator(identifierField);
      await expect(identifier).toBeVisible({ timeout: 30_000 });

      await identifier.fill(phone);
      await page.locator('form button[type="submit"]').click();

      await expect(identifier).toHaveAttribute('aria-invalid', 'true');
      const errorId = await identifier.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      await expect(page.locator(`#${errorId}`)).toContainText(/missing information/i);
      await expect(page.locator(otpField)).toHaveCount(0);
      expect(sent).toHaveLength(0);
    });
  }
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
});

/** The newest 6-digit code emailed to `address`, polled from Mailpit. */
async function latestOtp(address: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=5`);
    if (res.ok) {
      const list = (await res.json()) as { messages?: { ID: string }[] };
      for (const msg of list.messages ?? []) {
        const d = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as {
          Text?: string;
          HTML?: string;
        };
        const m = `${d.Text ?? ''}\n${d.HTML ?? ''}`.match(/\b(\d{6})\b/);
        if (m?.[1]) return m[1];
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No OTP email for ${address} within ${timeoutMs}ms (Mailpit at ${MAILPIT_URL})`);
}

// Criterion 2: a new email, by real code, reaches create-account; no phone / second identifier is
// asked for; name + password + terms leave /auth for the signed-in app and the session survives a reload.
test.describe('auth sign-up (real send via Mailpit)', () => {
  test('a new email signs up with name, password and terms only', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `web-signup-${Date.now()}@example.com`;
    await page.goto('/auth');
    const identifier = page.locator(identifierField);
    await expect(identifier).toBeVisible({ timeout: 30_000 });

    await identifier.fill(email);
    await page.locator('form button[type="submit"]').click();

    await expect(page.locator(otpField)).toBeVisible();
    await page.locator(otpField).fill(await latestOtp(email));
    await page.locator('form button[type="submit"]').click();

    // Create-account: name, password, terms. Nothing else.
    const form = page.locator('form');
    await expect(form.locator('input[autocomplete="name"]')).toBeVisible({ timeout: 30_000 });
    await expect(form.locator('input[type="tel"], input[autocomplete="tel"], input[autocomplete="username"]')).toHaveCount(0);
    await expect(form.locator('input:not([type="checkbox"])')).toHaveCount(2);

    await form.locator('input[autocomplete="name"]').fill('Web Signup Test');
    await form.locator('input[autocomplete="new-password"]').fill('Padel-Jam-2026!');
    await form.locator('input[type="checkbox"]').check();
    await form.locator('button[type="submit"]').click();

    // A brand-new profile has not finished mobile's onboarding, so the web middleware sends /app on
    // to /onboarding (middleware.ts); either way the user is signed in and out of /auth.
    await expect(page).toHaveURL(/\/(app|onboarding)/, { timeout: 30_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/(app|onboarding)/);
    await expect(page.locator(identifierField)).toHaveCount(0);
  });
});
