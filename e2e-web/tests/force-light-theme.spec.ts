import { test, expect } from '@playwright/test';

/**
 * W4 / T-DM: web is light-only. With the OS in dark mode, and even with a saved
 * `localStorage.theme = 'dark'`, <html> must not get the `dark` class and a primary button
 * must keep a fill that differs from the page background (in dark mode the primary fill
 * equalled the background, so buttons looked empty).
 *
 * The button is the auth form's Continue (`variant="primary"`, same as Join/Follow/Apply):
 * no signed-in fixture exists in this suite to reach Join. No Supabase needed.
 * The "App preferences no longer shows Appearance" check is not covered: no signed-in fixture.
 */
test.use({ colorScheme: 'dark' });
test.describe.configure({ timeout: 60_000 });

async function expectLightWithFilledPrimary(page: import('@playwright/test').Page) {
  await page.goto('/auth');
  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toBeVisible({ timeout: 30_000 });

  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

  const { button, page: bg } = await page.evaluate(() => {
    const b = document.querySelector('form button[type="submit"]') as HTMLElement;
    return {
      button: getComputedStyle(b).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(button).not.toBe(bg);
}

test('OS in dark mode, nothing saved: stays light', async ({ page }) => {
  await expectLightWithFilledPrimary(page);
});

test('OS in dark mode, localStorage.theme = "dark": stays light', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  await expectLightWithFilledPrimary(page);
});
