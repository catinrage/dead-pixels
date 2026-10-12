import { expect, type Page, test } from '@playwright/test';

/* The game exposes `window.__dp` for tests: it reads state and skips the slow parts (digging to 100%). */

type DpState = {
  picture: string;
  reveal: number;
  inks: Record<string, number>;
  levels: Record<string, number>;
  bits: number;
  tool: number;
  tools: string[];
  choosing: boolean;
  dp: { i: number } | null;
  deleted: number;
  started: boolean;
  moment: boolean;
};

const state = (page: Page): Promise<DpState> => page.evaluate(() => (window as any).__dp.state());
const dp = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__dp[f as string](...(a as unknown[])), [fn, args] as const);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#start-btn').click();
  await expect(page.locator('#start')).toBeHidden();
}

/** Run until the moment's Continue button shows, then press it. */
async function finishMoment(page: Page): Promise<void> {
  const go = page.locator('#mo-go');
  await expect(go).toBeVisible({ timeout: 8000 });
  await go.click();
  await expect(page.locator('#moment')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // a clean browser profile for every test, unless the test seeds a save itself
    if (!sessionStorage.getItem('keep')) localStorage.clear();
  });
});

test('starts, digs and earns ink with no errors', async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await start(page);
  const box = (await page.locator('#game').boundingBox()) as { x: number; y: number; width: number; height: number };
  const at = { x: box.x + box.width / 2 + 50, y: box.y + box.height / 2 };
  if (isMobile) {
    // a held finger: aim just right of the player and keep pressing
    const [x, y] = await page.evaluate(() => {
      const p = (window as any).__dp.sim().player;
      return [p.x + 4, p.y];
    });
    await dp(page, 'aim', x, y, true);
  } else {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
  }
  await expect.poll(async () => (await state(page)).deleted, { timeout: 8000 }).toBeGreaterThan(5);
  if (!isMobile) await page.mouse.up();
  const s = await state(page);
  expect(s.inks.gray + s.inks.red + s.inks.blue + s.inks.green + s.inks.gold).toBeGreaterThan(0);
  // no sideways scrolling at any size
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('the upgrade tree buys nodes', async ({ page, isMobile }) => {
  await start(page);
  await dp(page, 'gain', 'gray', 500);
  await page.keyboard.press('u');
  await expect(page.locator('#tree')).toBeVisible();
  // a mouse click buys at once; a first tap only selects, so a stray touch never spends ink
  const node = page.locator('#tree-nodes [data-id="speed"]');
  if (isMobile) await node.tap();
  else await node.click();
  await expect(page.locator('#nc-name')).toHaveText('Light Feet');
  await expect.poll(async () => (await state(page)).levels.speed ?? 0).toBe(isMobile ? 0 : 1);
  await page.locator('#nc-buy').click();
  await expect.poll(async () => (await state(page)).levels.speed).toBe(isMobile ? 1 : 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tree')).toBeHidden();
});

test('Defrag pays Bits, waits on the gallery and starts a fresh run', async ({ page }) => {
  await start(page);
  await dp(page, 'clearTo', 32);
  await expect(page.locator('#btn-defrag')).toBeEnabled();
  await page.locator('#btn-defrag').click();
  await page
    .locator('#modal-actions button', { hasText: /defrag/i })
    .last()
    .click();
  await finishMoment(page);
  const s = await state(page);
  expect(s.bits).toBeGreaterThan(0);
  expect(s.choosing).toBe(true);
  await expect(page.locator('#gallery')).toBeVisible();
  await expect(page.locator('#gal-title')).toHaveText('Choose the next picture');
  // spend Bits before picking, then open the picture again
  await page.locator('#gal-grid button.pic', { hasText: 'Neon Sunset' }).click();
  await expect(page.locator('#gallery')).toBeHidden();
  const after = await state(page);
  expect(after.choosing).toBe(false);
  expect(after.reveal).toBeLessThan(5);
});

test('restoring a picture opens the next one and its story fragment', async ({ page }) => {
  await start(page);
  await dp(page, 'catchDp');
  await expect(page.locator('#modal')).toBeVisible({ timeout: 4000 });
  await page.locator('#modal-actions button').first().click();
  await dp(page, 'clearTo', 100);
  await expect(page.locator('#btn-restore')).toBeVisible();
  await page.locator('#btn-restore').click();
  await finishMoment(page);
  await expect(page.locator('#gallery')).toBeVisible();
  await page.locator('#gal-grid button.pic', { hasText: 'Spiral Galaxy' }).click();
  const s = await state(page);
  expect(s.picture).toBe('galaxy');
  expect(s.bits).toBeGreaterThan(90);
});

test('progress survives a reload', async ({ page }) => {
  await start(page);
  await dp(page, 'addBits', 37);
  await dp(page, 'gain', 'gray', 123);
  await page.evaluate(() => {
    sessionStorage.setItem('keep', '1');
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload();
  await expect(page.locator('#start-btn')).toHaveText('Continue');
  await page.locator('#start-btn').click();
  const s = await state(page);
  expect(s.bits).toBe(37);
  expect(Math.floor(s.inks.gray)).toBe(123);
});

test('an MVP save carries over', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    sessionStorage.setItem('keep', '1');
    localStorage.clear();
    localStorage.setItem(
      'deadpixels.save.v1',
      JSON.stringify({ v: 1, t: Date.now(), seed: 12345, imageIdx: 1, defrags: 3, bits: 64, cells: '', levels: { core: 1, drill: 1 } }),
    );
  });
  await page.goto('/');
  await expect(page.locator('#start-note')).toContainText(/carried over|MVP|earlier version/i);
  await page.locator('#start-btn').click();
  const s = await state(page);
  expect(s.bits).toBe(64);
  expect(s.tools).toContain('brush');
});

test('settings export a save code that imports back', async ({ page }) => {
  await start(page);
  await dp(page, 'addBits', 11);
  const code = (await dp(page, 'exportCode')) as string;
  expect(code.startsWith('DP2:')).toBe(true);
  await dp(page, 'addBits', 100);
  expect(await dp(page, 'importCode', code)).toBe(true);
  expect((await state(page)).bits).toBe(11);
});
