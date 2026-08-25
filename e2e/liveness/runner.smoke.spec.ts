import { test, expect } from '../../playwright-fixture';

test('browser runner opens two isolated real client contexts', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const peerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  try {
    const [hostPage, peerPage] = await Promise.all([
      hostContext.newPage(),
      peerContext.newPage(),
    ]);
    await Promise.all([
      hostPage.goto('/auth', { waitUntil: 'domcontentloaded' }),
      peerPage.goto('/auth', { waitUntil: 'domcontentloaded' }),
    ]);
    await Promise.all([
      expect(hostPage.getByRole('button', { name: 'Login', exact: true })).toBeVisible(),
      expect(peerPage.getByRole('button', { name: 'Login', exact: true })).toBeVisible(),
    ]);

    await hostPage.evaluate(() => localStorage.setItem('ptown-e2e-isolation-probe', 'host-only'));
    await expect.poll(() => peerPage.evaluate(
      () => localStorage.getItem('ptown-e2e-isolation-probe'),
    )).toBeNull();
  } finally {
    await Promise.allSettled([hostContext.close(), peerContext.close()]);
  }
});
