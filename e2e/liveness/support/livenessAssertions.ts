import { expect, type Page } from '@playwright/test';

const LIVE_ROOT = '[data-lifecycle-branch="loaded-inner"]';
const ACTION_SURFACE = '[data-authoritative-action-surface]';

async function visibleActionSurfaceNames(page: Page): Promise<string[]> {
  return page.locator(ACTION_SURFACE).evaluateAll((nodes) => nodes
    .filter((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    })
    .map((node) => node.getAttribute('data-authoritative-action-surface') ?? 'unknown'));
}

export async function waitForLoadedTable(page: Page): Promise<void> {
  await expect(page.locator(LIVE_ROOT)).toHaveCount(1);
  await expect(page.locator('[data-canonical-shell-root]')).toHaveCount(1);
  await expect(page.locator('[data-canonical-felt-surface]')).toHaveCount(1);
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay')).toHaveCount(0);
}

export async function expectAuthoritativeGameType(page: Page, gameType: string): Promise<void> {
  await expect(page.locator(LIVE_ROOT)).toHaveAttribute('data-authoritative-game-type', gameType);
  await expect(page.locator(LIVE_ROOT)).toHaveAttribute(
    'data-authoritative-dealer-game-id',
    /[0-9a-f]{8}-[0-9a-f-]{27,}/i,
  );
}

export async function waitForBothClientsInLiveGame(
  hostPage: Page,
  peerPage: Page,
  gameType: string,
): Promise<void> {
  await Promise.all([
    expectAuthoritativeGameType(hostPage, gameType),
    expectAuthoritativeGameType(peerPage, gameType),
  ]);
  await expect.poll(async () => Promise.all([hostPage, peerPage].map(async (page) => (
    page.locator(LIVE_ROOT).getAttribute('data-authoritative-game-status')
  ))), { timeout: 60_000 }).toEqual(['in_progress', 'in_progress']);
  await expect.poll(async () => {
    const [hostGameId, peerGameId, hostDealerGameId, peerDealerGameId] = await Promise.all([
      hostPage.locator(LIVE_ROOT).getAttribute('data-authoritative-game-id'),
      peerPage.locator(LIVE_ROOT).getAttribute('data-authoritative-game-id'),
      hostPage.locator(LIVE_ROOT).getAttribute('data-authoritative-dealer-game-id'),
      peerPage.locator(LIVE_ROOT).getAttribute('data-authoritative-dealer-game-id'),
    ]);
    return Boolean(
      hostGameId
      && hostGameId === peerGameId
      && hostDealerGameId
      && hostDealerGameId === peerDealerGameId,
    );
  }, { timeout: 60_000 }).toBe(true);
}

export async function waitForEitherClientAction(
  hostPage: Page,
  peerPage: Page,
): Promise<{ host: string[]; peer: string[] }> {
  let latest = { host: [] as string[], peer: [] as string[] };
  await expect.poll(async () => {
    latest = {
      host: await visibleActionSurfaceNames(hostPage),
      peer: await visibleActionSurfaceNames(peerPage),
    };
    return latest.host.length + latest.peer.length;
  }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBeGreaterThan(0);
  return latest;
}

export async function waitForBothClientsAction(
  hostPage: Page,
  peerPage: Page,
  actionSurface: string = ACTION_SURFACE,
): Promise<void> {
  await Promise.all([
    expect(hostPage.locator(actionSurface).first()).toBeVisible({ timeout: 60_000 }),
    expect(peerPage.locator(actionSurface).first()).toBeVisible({ timeout: 60_000 }),
  ]);
}

export async function expectCanonicalContinuity(page: Page): Promise<void> {
  await waitForLoadedTable(page);
  await expect(page.locator('[data-canonical-bootstrap]')).toHaveCount(0);
  await expect(page.locator('[data-canonical-shell-root] [data-canonical-shell-root]')).toHaveCount(0);
}
