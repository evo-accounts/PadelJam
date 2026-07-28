import { test, expect } from '@playwright/test';

// Canonical Playwright smoke test — hits the public docs site so it passes
// without the local app running. Replace with PadelJam flows (see the commented
// example below) once you point tests at the `web` app via baseURL.

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});

// Example of testing the local web app (needs the dev server running, or the
// webServer block enabled in playwright.config.ts). baseURL makes '/' resolve
// to http://localhost:3000/.
//
// test('home page loads', async ({ page }) => {
//   await page.goto('/');
//   await expect(page).toHaveTitle(/PadelJam/i);
// });
