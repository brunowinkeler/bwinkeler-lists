import { expect, test, type Locator, type Page } from '@playwright/test';

const STORAGE_STATE = 'playwright/.auth/user.json';

// The suite authenticates once (see auth.setup.ts) and reuses the session via
// storageState, so this just lands on the authenticated overview.
async function login(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your lists' })).toBeVisible({ timeout: 15_000 });
}

async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  if (!from) throw new Error('source bounding box missing');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross the 5px pointer-sensor activation threshold in small steps so dnd-kit
  // reliably enters drag mode even when the event loop is busy under load.
  await page.mouse.move(startX, startY - 6, { steps: 3 });
  await page.mouse.move(startX, startY - 14, { steps: 3 });
  await page.waitForTimeout(60);
  const to = await target.boundingBox();
  if (!to) throw new Error('target bounding box missing');
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  // dnd-kit's onDragOver reflows the board (the item is lifted out of its
  // column), which can shift the target out from under the pointer. Let that
  // settle, then re-read the persistent target and release directly over its
  // current position so `over` is defined when onDragEnd fires.
  await page.waitForTimeout(150);
  const settled = await target.boundingBox();
  if (settled) {
    await page.mouse.move(settled.x + settled.width / 2, settled.y + settled.height / 2, {
      steps: 5,
    });
  }
  await page.mouse.up();
}

async function dragUpWithScroll(
  page: Page,
  source: Locator,
  target: Locator,
  options: { dropInTopGap?: boolean } = {},
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error('source bounding box missing');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 10, { steps: 4 });
  await page.waitForTimeout(80);

  // Keep the drag active while scrolling toward an off-screen target. This is
  // the production case that exposed viewport/collation ordering differences.
  await page.mouse.move(startX, 90, { steps: 12 });
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(250);

  if (options.dropInTopGap) {
    // Sortable siblings move down to expose the first insertion slot. Keep the
    // pointer in that stable gap instead of chasing the transformed first row.
    await page.mouse.up();
    return;
  }

  const to = await target.boundingBox();
  if (!to) throw new Error('target bounding box missing after scroll');
  await page.mouse.move(to.x + to.width / 2, to.y - 12, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
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
  const contextA = await browser.newContext({ storageState: STORAGE_STATE });
  const contextB = await browser.newContext({ storageState: STORAGE_STATE });
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

test('quick-add creates an item directly in a category', async ({ page }) => {
  await login(page);
  const listName = `QuickAdd ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New category name').fill('Fruit');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Fruit', exact: true })).toBeVisible();

  const fruitPanel = page.locator('.panel', {
    has: page.getByRole('button', { name: 'Fruit', exact: true }),
  });
  await fruitPanel.getByRole('button', { name: 'Add item to “Fruit”' }).click();
  await fruitPanel.getByLabel('New item for “Fruit”').fill('Discard this draft');
  await page.getByRole('heading', { name: listName }).click();
  await expect(fruitPanel.getByLabel('New item for “Fruit”')).toHaveCount(0);
  await expect(fruitPanel.getByRole('button', { name: 'Add item to “Fruit”' })).toBeVisible();
  await expect(fruitPanel.getByLabel('Item title', { exact: true })).toHaveCount(0);

  await fruitPanel.getByRole('button', { name: 'Add item to “Fruit”' }).click();
  await fruitPanel.getByLabel('New item for “Fruit”').fill('Banana');
  await fruitPanel.getByLabel('New item for “Fruit”').press('Enter');

  await expect(fruitPanel.getByLabel('Item title', { exact: true })).toHaveValue('Banana');
  await expect(page.locator('.panel--uncategorized').getByLabel('Item title')).toHaveCount(0);

  await page.reload();
  await expect(fruitPanel.getByLabel('Item title', { exact: true })).toHaveValue('Banana');
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
  await page.getByLabel('New category name').fill('Gamma');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Gamma', exact: true })).toBeVisible();

  // Simulate production-sized panels so Gamma starts well below Alpha.
  await page.locator('.panel:not(.panel--uncategorized) .panel__body').evaluateAll((bodies) => {
    for (const body of bodies) (body as HTMLElement).style.minHeight = '320px';
  });

  // Move Gamma from third to first, crossing an intervening category.
  const gammaHandle = page.getByRole('button', { name: 'Reorder category “Gamma”' });
  const alphaHandle = page.getByRole('button', { name: 'Reorder category “Alpha”' });
  await dragUpWithScroll(page, gammaHandle, alphaHandle, { dropInTopGap: true });

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
    .toEqual(['Gamma', 'Alpha', 'Beta', 'Uncategorized']);

  await page.reload();
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
    .toEqual(['Gamma', 'Alpha', 'Beta', 'Uncategorized']);
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
  await page.getByLabel('New item title').fill('Third');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true })).toHaveCount(3);

  const handles = page.getByRole('button', { name: 'Drag to reorder' });
  // Drag the third item's handle up past the first item's midpoint and release.
  await dragUpWithScroll(page, handles.nth(2), handles.nth(0));

  await expect
    .poll(async () =>
      page
        .getByLabel('Item title', { exact: true })
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    )
    .toEqual(['Third', 'First', 'Second']);

  await page.reload();
  await expect
    .poll(async () =>
      page
        .getByLabel('Item title', { exact: true })
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    )
    .toEqual(['Third', 'First', 'Second']);
});

test('a small drag keeps items in place (midpoint threshold)', async ({ page }) => {
  await login(page);
  const listName = `Tiny ${Date.now()}`;
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
  const second = await handles.nth(1).boundingBox();
  if (!second) throw new Error('handle not found');
  // Nudge the second item up a little — not past the first item's midpoint — and
  // drop: the order must stay the same.
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y - 10, { steps: 4 });
  await page.mouse.move(second.x + second.width / 2, second.y - 26, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.up();

  await expect(
    page
      .getByLabel('Item title', { exact: true })
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
  ).resolves.toEqual(['First', 'Second']);
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
  await dragOnto(page, handle, fruitPanel.locator('.panel__body'));

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

test('set a category color that persists', async ({ page }) => {
  await login(page);
  const listName = `Color ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();

  await page.getByLabel('New category name').fill('Palette');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Palette', exact: true })).toBeVisible();

  await page.getByLabel('Change color of category “Palette”').click();
  await page.getByRole('button', { name: 'Set color #3b82f6' }).click();

  const dot = page
    .locator('.panel', { has: page.getByRole('button', { name: 'Palette', exact: true }) })
    .locator('.color-dot');
  await expect
    .poll(async () => dot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(59, 130, 246)');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Palette', exact: true })).toBeVisible();
  await expect
    .poll(async () => dot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(59, 130, 246)');
});

test('pinning a list moves it to the top', async ({ page }) => {
  await login(page);
  const name = `Pin ${Date.now()}`;
  await page.getByLabel('New list name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.goto('/');

  const tile = page.locator('.list-tile-wrap', { has: page.getByText(name, { exact: true }) });
  await tile.hover();
  await tile.getByRole('button', { name: /to top/ }).click();

  const pinnedSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Pinned' }) });
  await expect(pinnedSection.getByText(name, { exact: true })).toBeVisible();

  // Persists across reload.
  await page.reload();
  await expect(pinnedSection.getByText(name, { exact: true })).toBeVisible();
});

test('mobile layout stays inside an iPhone 13 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('maximum-scale=1');
  expect(viewport).toContain('user-scalable=no');
  await expectNoHorizontalOverflow(page);

  await page.locator('summary[aria-label^="Notifications"]').click();
  const notifications = page.locator('.notifications-menu__panel');
  await expect(notifications).toBeVisible();
  const notificationBox = await notifications.boundingBox();
  expect(notificationBox).not.toBeNull();
  expect(notificationBox!.x).toBeGreaterThanOrEqual(0);
  expect(notificationBox!.x + notificationBox!.width).toBeLessThanOrEqual(390);
  await page.locator('summary[aria-label^="Notifications"]').click();

  const listName = `Mobile ${Date.now()}`;
  await page.getByLabel('New list name').fill(listName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: listName })).toBeVisible();
  await page.getByLabel('New category name').fill('Mobile category');
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByLabel('Change color of category “Mobile category”').click();

  const colorPicker = page.locator('.color-picker__panel:visible');
  const colorBox = await colorPicker.boundingBox();
  expect(colorBox).not.toBeNull();
  expect(colorBox!.x).toBeGreaterThanOrEqual(0);
  expect(colorBox!.x + colorBox!.width).toBeLessThanOrEqual(390);
  await expectNoHorizontalOverflow(page);
});
