import { expect, test } from '@playwright/test';

test('optional diagnostic module failure remains contained across repeated browser renders', async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The source-module regression fixture requires a local Vite server.');
  }
  const errors: string[] = [];
  let attempts = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/optional-diagnostics-fixture', route => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><title>Optional diagnostic regression</title>
    <button id="render">Render diagnostic</button><output id="state">starting</output>
    <script type="module">
      import { withH1r3H2r1Diagnostics as run } from '/src/lib/threeFiveSeven/wartime/optionalSeamDiagnostics.ts';
      import { setWartimeActiveGameContext as setContext } from '/src/lib/threeFiveSeven/wartime/capture.ts';
      const scope = { gameId: 'fixture-session', dealerGameId: 'fixture-dealer' };
      window.setCapture = enabled => setContext({ ...scope, enabled, gameType: '3-5-7' });
      window.setCapture(false);
      window.callbackCount = 0;
      document.querySelector('#render').onclick = () => { for (let i=0;i<300;i++) run(scope, () => { window.callbackCount++; }); };
      document.querySelector('#state').textContent = 'ready';
    </script>` }));
  await page.route(/\/src\/lib\/threeFiveSeven\/wartime\/h1r3ToH2r1\.ts(?:\?.*)?$/, route => {
    attempts++;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stale asset fallback</title>' });
  });
  // This standalone fixture must never submit data to any backend.
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/optional-diagnostics-fixture');
  await expect(page.locator('#state')).toHaveText('ready');
  await page.locator('#render').click();
  await page.waitForTimeout(100);
  expect(attempts, 'capture off loads nothing').toBe(0);
  await page.evaluate(() => (window as unknown as { setCapture: (enabled: boolean) => void }).setCapture(true));
  await page.locator('#render').click();
  await expect.poll(() => attempts).toBe(1);
  await page.waitForTimeout(100);
  for (let n = 0; n < 10; n++) await page.locator('#render').click();
  await page.waitForTimeout(100);
  expect(attempts, 'failed optional import is not retried across thousands of callers').toBe(1);
  expect(await page.evaluate(() => (window as unknown as { callbackCount: number }).callbackCount)).toBe(0);
  expect(errors).toEqual([]);
});
