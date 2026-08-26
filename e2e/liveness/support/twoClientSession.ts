import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/integrations/supabase/types';
import { CrossCountryNetwork, runOfflineBurst } from './crossCountryNetwork';
import { e2eEnvironment, type PlayerCredentials } from './env';
import { acquireIdentityLease, type IdentityLease } from './runIsolation';
import { assertHumanChaosRuntimeTarget } from '../../humanChaos/target';

export type DealerGameType =
  | 'holm-game'
  | '3-5-7'
  | 'cribbage'
  | 'gin-rummy'
  | 'horses'
  | 'ship-captain-crew'
  | 'yahtzee';

type Credentials = PlayerCredentials;

export type DealerGameEntryOptions = {
  configure?: (configSurface: ReturnType<Page['locator']>, setupPage: Page) => Promise<void>;
  submitNonDealerAnte?: boolean;
};

export type TwoClientSession = {
  hostContext: BrowserContext;
  peerContext: BrowserContext;
  hostPage: Page;
  peerPage: Page;
  hostNetwork: CrossCountryNetwork;
  peerNetwork: CrossCountryNetwork;
  cleanupClient: SupabaseClient<Database>;
  gameId: string;
  identityLease: IdentityLease | null;
};

async function login(page: Page, credentials: Credentials): Promise<void> {
  const previewAccessUrl = process.env.PTOWN_E2E_PREVIEW_ACCESS_URL?.trim();
  if (previewAccessUrl) {
    await page.goto(previewAccessUrl, { waitUntil: 'domcontentloaded' });
  }
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

export async function waitForDealerGameSetupOwner(hostPage: Page, peerPage: Page): Promise<Page> {
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
  const identityLease = acquireIdentityLease(
    { player1: hostCredentials, player2: peerCredentials },
    e2eEnvironment.isolation,
  );
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
    const runtime = await hostNetwork.waitForRuntimeConfig();
    if (process.env.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF) {
      assertHumanChaosRuntimeTarget(runtime.url);
    }
    const cleanupClient = createClient<Database>(runtime.url, runtime.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { error: cleanupAuthError } = await cleanupClient.auth.signInWithPassword(hostCredentials);
    if (cleanupAuthError) {
      throw new Error(`Could not authenticate fake-money cleanup client: ${cleanupAuthError.message}`);
    }

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
      cleanupClient,
      gameId,
      identityLease,
    };

    console.log(
      `[two-client] namespace=${e2eEnvironment.isolation.runNamespace ?? 'default'} `
      + `identity_slot=${e2eEnvironment.isolation.identitySlot ?? 'default'} game_id=${gameId}`,
    );

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
    identityLease?.release();
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
  options: DealerGameEntryOptions = {},
): Promise<void> {
  await startSessionUnderChaos(session);
  await configureDealerGameUnderChaos(session, gameType, options);
}

/** Starts the real session dealer draw while the peer experiences a radio loss. */
export async function startSessionUnderChaos(session: TwoClientSession): Promise<void> {
  const { hostPage, peerContext, peerNetwork } = session;
  peerNetwork.useLongHaulProfile();
  await hostPage.locator('[data-start-game-btn]').click();
  await runOfflineBurst(peerContext, 1_750);
}

/**
 * Configures the currently authoritative dealer-setup turn. This is shared by
 * session entry and cross-dealer-game transition tests: neither caller gets a
 * browser-owned shortcut around setup, ante, or the ambiguous ante response.
 */
export async function configureDealerGameUnderChaos(
  session: TwoClientSession,
  gameType: DealerGameType,
  options: DealerGameEntryOptions = {},
): Promise<void> {
  const {
    hostPage,
    peerPage,
    peerContext,
    hostNetwork,
    peerNetwork,
  } = session;
  peerNetwork.useLongHaulProfile();
  const setupPage = await waitForDealerGameSetupOwner(hostPage, peerPage);
  if (['horses', 'ship-captain-crew', 'yahtzee'].includes(gameType)) {
    await setupPage.getByRole('tab', { name: 'Dice Games', exact: true }).click();
  }
  const simpleConfigTypes = new Set<DealerGameType>([
    'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee',
  ]);
  const defaultsResponse = simpleConfigTypes.has(gameType)
    ? setupPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/rest/v1/game_defaults')
          && url.searchParams.get('game_type') === `eq.${gameType}`;
      }, { timeout: 15_000 })
    : null;
  await setupPage.locator(`[data-dealer-game-option="${gameType}"]`).click();
  // The config surface mounts before its defaults request resolves. Waiting for
  // that response prevents a late default from overwriting a harness choice.
  await defaultsResponse;
  const configSurface = setupPage.locator(
    `[data-dealer-game-setup-step="config"][data-dealer-game-setup-selected-game="${gameType}"]`,
  );
  await expect(configSurface).toBeVisible();
  await options.configure?.(configSurface, setupPage);
  await configSurface.locator(`[data-dealer-game-start="${gameType}"]`).click();

  if (options.submitNonDealerAnte === false) return;
  await submitOutstandingAnteUnderChaos(session);
}

/**
 * Resolves the one human ante still outstanding after either a fresh config or
 * Run Back. The response-loss fault is intentional: the write must commit once
 * and both browsers must reconcile from authoritative state.
 */
export async function submitOutstandingAnteUnderChaos(session: TwoClientSession): Promise<void> {
  const {
    hostPage,
    peerPage,
    hostNetwork,
    peerNetwork,
  } = session;
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
  try {
    await Promise.allSettled([session.hostContext.close(), session.peerContext.close()]);
  } finally {
    session.identityLease?.release();
  }
}

export async function blastFakeMoneySession(session: TwoClientSession): Promise<void> {
  session.hostNetwork.useHealthyProfile();
  session.peerNetwork.useHealthyProfile();
  await Promise.all([
    session.hostNetwork.waitForDelayedDeliveries(),
    session.peerNetwork.waitForDelayedDeliveries(),
  ]);

  const runWithDeadline = async <T>(
    operation: (signal: AbortSignal) => PromiseLike<T>,
    label: string,
  ): Promise<T> => {
    let lastError: unknown = null;
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        return await Promise.resolve(operation(controller.signal));
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        clearTimeout(timer);
      }
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${label} failed after ${attempts} attempts: ${detail}`);
  };

  const result = await runWithDeadline(
    async (signal) => {
      const { data, error } = await session.cleanupClient
        .rpc('admin_blast_fake_money_game', { p_game_id: session.gameId })
        .abortSignal(signal);
      if (error) throw error;
      return data as { outcome?: string } | null;
    },
    'Fake-money blast RPC',
  );
  if (result?.outcome !== 'deleted' && result?.outcome !== 'already-deleted') {
    throw new Error(`Unexpected fake-money blast outcome: ${result?.outcome ?? 'missing'}`);
  }

  const remaining = await runWithDeadline(
    async (signal) => {
      const { data, error } = await session.cleanupClient
        .from('games')
        .select('id')
        .eq('id', session.gameId)
        .maybeSingle()
        .abortSignal(signal);
      if (error) throw error;
      return data;
    },
    'Fake-money cleanup verification',
  );
  if (remaining) throw new Error('Fake-money cleanup returned but the session still exists');
  console.log(
    `[two-client] namespace=${e2eEnvironment.isolation.runNamespace ?? 'default'} `
    + `game_id=${session.gameId} cleanup=verified`,
  );
}
