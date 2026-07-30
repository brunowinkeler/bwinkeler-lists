import { expect, test, type Locator, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('dev-password-change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your lists' })).toBeVisible();
}

async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('bounding box missing');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 8, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, { steps: 4 });
  await page.mouse.up();
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

test('rename a list by clicking its title', async ({ page }) => {
  await login(page);
  const listName = `Ren ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByRole('heading', { name: listName }).click();
  const input = page.getByLabel('List name');
  await expect(input).toBeVisible();
  const renamed = `${listName} renamed`;
  await input.fill(renamed);
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible();
});

test('reorder categories by dragging', async ({ page }) => {
  await login(page);
  const listName = `CatOrder ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New category name').fill('Alpha');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible();
  await page.getByLabel('New category name').fill('Beta');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();

  // Move Beta above Alpha by dragging its handle.
  const betaHandle = page.getByRole('button', { name: 'Reorder category “Beta”' });
  const alphaHandle = page.getByRole('button', { name: 'Reorder category “Alpha”' });
  const from = await betaHandle.boundingBox();
  const to = await alphaHandle.boundingBox();
  if (!from || !to) throw new Error('handles not found');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.move(to.x + to.width / 2, to.y - 10, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.panel .panel__title')).map((title) => {
          const el =
            title.querySelector('button.ghost') ?? title.querySelector('span:not(.panel__count)');
          return el?.textContent?.trim() ?? '';
        }),
      ),
    )
    .toEqual(['Uncategorized', 'Beta', 'Alpha']);
});

test('reorder items within a bucket', async ({ page }) => {
  await login(page);
  const listName = `ItemOrder ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New item title').fill('First');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true })).toHaveCount(1);
  await page.getByLabel('New item title').fill('Second');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true })).toHaveCount(2);

  const handles = page.getByRole('button', { name: 'Drag to reorder' });
  await dragOnto(page, handles.nth(1), handles.nth(0));

  await expect
    .poll(async () =>
      page
        .getByLabel('Item title', { exact: true })
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    )
    .toEqual(['Second', 'First']);
});

test('move an item into a category', async ({ page }) => {
  await login(page);
  const listName = `Move ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New category name').fill('Fruit');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Fruit', exact: true })).toBeVisible();

  await page.getByLabel('New item title').fill('Banana');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true })).toHaveValue('Banana');

  const handle = page.getByRole('button', { name: 'Drag to reorder' }).first();
  const fruitPanel = page.locator('.panel', {
    has: page.getByRole('button', { name: 'Fruit', exact: true }),
  });
  await dragOnto(page, handle, fruitPanel.locator('.panel__empty'));

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const panels = Array.from(document.querySelectorAll('.panel'));
        const fruit = panels.find((p) =>
          p.querySelector('.panel__title')?.textContent?.includes('Fruit'),
        );
        return fruit
          ? Array.from(fruit.querySelectorAll('input[aria-label="Item title"]')).map(
              (i) => (i as HTMLInputElement).value,
            )
          : [];
      }),
    )
    .toContain('Banana');
});
