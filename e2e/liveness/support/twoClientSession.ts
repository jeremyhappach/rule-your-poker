import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { CrossCountryNetwork, runOfflineBurst } from './crossCountryNetwork';

export type DealerGameType =
  | 'holm-game'
  | '3-5-7'
  | 'cribbage'
  | 'gin-rummy'
  | 'horses'
  | 'ship-captain-crew'
  | 'yahtzee';

type Credentials = { email: string; password: string };

export type TwoClientSession = {
  hostContext: BrowserContext;
  peerContext: BrowserContext;
  hostPage: Page;
  peerPage: Page;
  hostNetwork: CrossCountryNetwork;
  peerNetwork: CrossCountryNetwork;
  gameId: string;
};

async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(credentials.email);
  await page.locator('#login-password').fill(credentials.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Game Lobby', { exact: true }).first()).toBeVisible();
}

function gameIdFromUrl(url: string): string {
  const match = /\/game\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(url);
  if (!match) throw new Error(`Could not read game id from ${url}`);
  return match[1];
}

async function waitForSetupOwner(hostPage: Page, peerPage: Page): Promise<Page> {
  let owner: Page | null = null;
  await expect.poll(async () => {
    if (await hostPage.locator('[data-dealer-game-setup-step="game-selection"]').count()) {
      owner = hostPage;
      return 'host';
    }
    if (await peerPage.locator('[data-dealer-game-setup-step="game-selection"]').count()) {
      owner = peerPage;
      return 'peer';
    }
    return 'none';
  }, { timeout: 75_000, intervals: [250, 500, 1_000] }).not.toBe('none');
  if (!owner) throw new Error('Dealer setup owner was never rendered');
  return owner;
}

export async function createTwoClientSession(
  browser: Browser,
  hostCredentials: Credentials,
  peerCredentials: Credentials,
): Promise<TwoClientSession> {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const peerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const hostNetwork = new CrossCountryNetwork();
  const peerNetwork = new CrossCountryNetwork();
  await Promise.all([
    hostNetwork.attach(hostContext),
    peerNetwork.attach(peerContext),
  ]);

  const hostPage = await hostContext.newPage();
  const peerPage = await peerContext.newPage();
  let createdSession: TwoClientSession | null = null;

  try {
    await Promise.all([
      login(hostPage, hostCredentials),
      login(peerPage, peerCredentials),
    ]);

    await hostPage.getByRole('button', { name: 'Create New Game', exact: true }).click();
    const createDialog = hostPage.getByRole('dialog', { name: 'Create New Game' });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByText('Real Money', { exact: true })).toBeVisible();
    await expect(createDialog.locator('input[type="checkbox"]')).not.toBeChecked();
    await createDialog.getByRole('button', { name: 'Create Game', exact: true }).click();
    await expect(hostPage).toHaveURL(/\/game\/[0-9a-f-]{36}$/i);
    const gameId = gameIdFromUrl(hostPage.url());
    createdSession = {
      hostContext,
      peerContext,
      hostPage,
      peerPage,
      hostNetwork,
      peerNetwork,
      gameId,
    };

    await peerPage.goto(`/game/${gameId}`);
    await expect(peerPage.locator('[data-lifecycle-branch="loaded-inner"]')).toHaveCount(1);
    const firstOpenSeat = peerPage.locator('[data-waiting-seat-open] button').first();
    await expect(firstOpenSeat).toBeVisible();
    await firstOpenSeat.click();
    await expect(hostPage.locator('[data-start-game-btn]')).toBeVisible();

    return createdSession;
  } catch (creationError) {
    let cleanupError: unknown = null;
    if (createdSession) {
      try {
        await blastFakeMoneySession(createdSession);
      } catch (error) {
        cleanupError = error;
      }
    }
    await Promise.allSettled([hostContext.close(), peerContext.close()]);
    if (cleanupError) {
      throw new AggregateError(
        [creationError, cleanupError],
        'Two-client setup failed and its fake-money session could not be blasted',
      );
    }
    throw creationError;
  }
}

export async function enterDealerGameUnderChaos(
  session: TwoClientSession,
  gameType: DealerGameType,
): Promise<void> {
  const {
    hostPage,
    peerPage,
    peerContext,
    hostNetwork,
    peerNetwork,
  } = session;
  peerNetwork.useLongHaulProfile();

  await hostPage.locator('[data-start-game-btn]').click();
  await runOfflineBurst(peerContext, 1_750);

  const setupPage = await waitForSetupOwner(hostPage, peerPage);
  if (['horses', 'ship-captain-crew', 'yahtzee'].includes(gameType)) {
    await setupPage.getByRole('tab', { name: 'Dice Games', exact: true }).click();
  }
  await setupPage.locator(`[data-dealer-game-option="${gameType}"]`).click();
  const configSurface = setupPage.locator(
    `[data-dealer-game-setup-step="config"][data-dealer-game-setup-selected-game="${gameType}"]`,
  );
  await expect(configSurface).toBeVisible();
  await configSurface.locator(`[data-dealer-game-start="${gameType}"]`).click();

  const hostAnte = hostPage.locator('[data-authoritative-action-surface="ante-decision"]');
  const peerAnte = peerPage.locator('[data-authoritative-action-surface="ante-decision"]');
  await expect.poll(async () => Number(await hostAnte.isVisible()) + Number(await peerAnte.isVisible()), {
    timeout: 30_000,
    intervals: [250, 500, 1_000],
  }).toBe(1);

  const hostMustDecide = await hostAnte.isVisible();
  const decisionSurface = hostMustDecide ? hostAnte : peerAnte;
  const decisionNetwork = hostMustDecide ? hostNetwork : peerNetwork;

  // Dealer configuration already commits the dealer's ante. The other human's
  // authoritative decision is committed, but that browser loses the exact RPC
  // response. Reconciliation must converge without a second write.
  decisionNetwork.loseNextResponse(/\/rest\/v1\/rpc\/submit_ante_decision$/);
  await decisionSurface.getByRole('button', { name: /Ante Up!/ }).click();
}

export async function closeTwoClientSession(session: TwoClientSession): Promise<void> {
  session.hostNetwork.useHealthyProfile();
  session.peerNetwork.useHealthyProfile();
  await Promise.all([
    session.hostNetwork.waitForDelayedDeliveries().catch(() => {}),
    session.peerNetwork.waitForDelayedDeliveries().catch(() => {}),
  ]);
  await Promise.allSettled([session.hostContext.close(), session.peerContext.close()]);
}

export async function blastFakeMoneySession(session: TwoClientSession): Promise<void> {
  const { hostPage } = session;
  if (hostPage.isClosed()) throw new Error('Host page closed before fake-money cleanup');

  const trigger = hostPage.locator('[data-player-options-trigger]').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const blast = hostPage.getByRole('menuitem', { name: /Blast This Game/ });
  await expect(blast).toBeVisible();
  await blast.click();
  await expect(hostPage).toHaveURL(/\/$/);
}
