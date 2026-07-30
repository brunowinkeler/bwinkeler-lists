import { test as setup, expect } from '@playwright/test';

// Logging in once per run and reusing the session avoids tripping the login
// rate limit (10/min per IP) when every spec would otherwise authenticate.
const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('dev-password-change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your lists' })).toBeVisible({ timeout: 15_000 });
  await page.context().storageState({ path: authFile });
});
