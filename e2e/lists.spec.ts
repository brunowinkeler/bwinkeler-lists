import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('dev-password-change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your lists' })).toBeVisible();
}

test('create a list, add and complete an item, and persist across reload', async ({ page }) => {
  await login(page);
  const listName = `E2E ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  // Creating a list navigates straight to the new list's page.
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New item title').fill('First item');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true }).first()).toHaveValue('First item');

  await page.getByRole('checkbox').first().click();
  await page.reload();
  await expect(page.getByLabel('Item title', { exact: true }).first()).toHaveValue('First item');
  await expect(page.getByRole('checkbox').first()).toBeChecked();
});

test('realtime: a second browser context sees a newly added item', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await login(pageA);
  const listName = `RT ${Date.now()}`;
  await pageA.getByLabel('New list name').fill(listName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  // Creating a list navigates straight to the new list's page.
  await expect(pageA.getByRole('heading', { name: listName })).toBeVisible();
  const listUrl = pageA.url();

  await login(pageB);
  await pageB.goto(listUrl);
  await expect(pageB.getByRole('heading', { name: listName })).toBeVisible();

  await pageA.getByLabel('New item title').fill('Realtime item');
  await pageA.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(pageB.getByLabel('Item title', { exact: true }).first()).toHaveValue(
    'Realtime item',
  );

  await contextA.close();
  await contextB.close();
});

test('create a category and see it as a panel', async ({ page }) => {
  await login(page);
  const listName = `Cat ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New category name').fill('Produce');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Produce', exact: true })).toBeVisible();
});

test('duplicate a list copies its items', async ({ page }) => {
  await login(page);
  const listName = `Dup ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New item title').fill('Copy me');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true }).first()).toHaveValue('Copy me');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate list' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Duplicate' }).click();

  await expect(page.getByRole('heading', { name: `${listName} (copy)` })).toBeVisible();
  await expect(page.getByLabel('Item title', { exact: true }).first()).toHaveValue('Copy me');
});
