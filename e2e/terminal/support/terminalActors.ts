import { expect, type Locator, type Page } from '@playwright/test';
import { findOptimalMelds } from '../../../src/lib/ginRummyScoring';
import type { GinRummyCard } from '../../../src/lib/ginRummyTypes';
import type { DealerGameType, TwoClientSession } from '../../liveness/support/twoClientSession';
import {
  TerminalSettlementProbe,
  type TerminalExpectation,
  type TerminalResult,
} from './terminalSettlementProbe';

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const LIVE_ROOT = '[data-lifecycle-branch="loaded-inner"]';

export const TERMINAL_EXPECTATIONS: Record<DealerGameType, TerminalExpectation> = {
  'holm-game': { gameType: 'holm-game', eventKind: 'chucky_final_award' },
  '3-5-7': { gameType: '3-5-7', settlementKey: 'three_five_seven_terminal' },
  cribbage: { gameType: 'cribbage', settlementKey: 'cribbage_terminal' },
  'gin-rummy': { gameType: 'gin-rummy', settlementKey: 'gin_rummy_terminal' },
  horses: { gameType: 'horses', settlementKey: 'horses_terminal' },
  'ship-captain-crew': { gameType: 'ship-captain-crew', settlementKey: 'horses_terminal' },
  yahtzee: { gameType: 'yahtzee', settlementKey: 'yahtzee_terminal' },
};

export async function configureShortestTerminal(
  gameType: DealerGameType,
  configSurface: Locator,
): Promise<void> {
  if (gameType === '3-5-7') {
    await configSurface.locator('#legs-to-win').fill('1');
    return;
  }
  if (gameType === 'cribbage') {
    await configSurface.getByRole('combobox').click();
    await configSurface.page().getByRole('option', { name: /Custom/ }).click();
    await configSurface.locator('input[type="number"]').fill('1');
    return;
  }
  if (gameType === 'gin-rummy') {
    await configSurface.getByRole('button', { name: /Short.*50 pts/ }).click();
  }
}

export async function authoritativeDealerGameId(session: TwoClientSession): Promise<string> {
  const dealerGameId = await session.hostPage.locator(LIVE_ROOT)
    .getAttribute('data-authoritative-dealer-game-id');
  if (!dealerGameId) throw new Error('Live table has no authoritative dealer-game identity');
  return dealerGameId;
}

export async function requestLastHand(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
): Promise<void> {
  const trigger = session.hostPage.locator('[data-player-options-trigger]').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await session.hostPage.getByRole('menuitem', { name: /End Session/ }).click();
  await session.hostPage.getByRole('button', { name: 'Confirm End Session', exact: true }).click();
  await probe.waitForLastHand(session.gameId);
}

export async function playDealerGameToTerminal(
  session: TwoClientSession,
  gameType: DealerGameType,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<TerminalResult> {
  const expected = TERMINAL_EXPECTATIONS[gameType];
  switch (gameType) {
    case 'holm-game':
      await playHolm(session, probe, dealerGameId, expected);
      break;
    case '3-5-7':
      await playThreeFiveSeven(session, probe, dealerGameId, expected);
      break;
    case 'cribbage':
      await playCribbage(session, probe, dealerGameId, expected);
      break;
    case 'gin-rummy':
      await playGin(session, probe, dealerGameId, expected);
      break;
    case 'horses':
    case 'ship-captain-crew':
      await playDice(session, probe, dealerGameId, expected);
      break;
    case 'yahtzee':
      await playYahtzee(session, probe, dealerGameId, expected);
      break;
  }
  return probe.waitForTerminalResult(session.gameId, dealerGameId, expected, 60_000);
}

async function isTerminal(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<boolean> {
  return Boolean(await probe.findTerminalResult(session.gameId, dealerGameId, expected));
}

async function playHolm(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  const selector = '[data-authoritative-action-surface="holm-357-decision"]';
  for (let hand = 0; hand < 80; hand += 1) {
    if (await isTerminal(session, probe, dealerGameId, expected)) return;
    const hostSurface = session.hostPage.locator(selector);
    const peerSurface = session.peerPage.locator(selector);
    try {
      await Promise.all([
        (async () => {
          await expect(hostSurface).toBeVisible({ timeout: 45_000 });
          await hostSurface.getByRole('button', { name: 'Stay', exact: true }).click();
        })(),
        (async () => {
          await expect(peerSurface).toBeVisible({ timeout: 45_000 });
          await peerSurface.getByRole('button', { name: 'Fold', exact: true }).click();
        })(),
      ]);
    } catch (error) {
      if (await isTerminal(session, probe, dealerGameId, expected)) return;
      throw error;
    }
    await expect(hostSurface).toBeHidden({ timeout: 20_000 }).catch(() => {});
  }
  throw new Error('Holm did not produce a player-vs-Chucky terminal win within 80 hands');
}

async function playThreeFiveSeven(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  const selector = '[data-authoritative-action-surface="holm-357-decision"]';
  const hostSurface = session.hostPage.locator(selector);
  const peerSurface = session.peerPage.locator(selector);
  await Promise.all([
    (async () => {
      await expect(hostSurface).toBeVisible({ timeout: 45_000 });
      await hostSurface.getByRole('button', { name: 'Stay', exact: true }).click();
    })(),
    (async () => {
      await expect(peerSurface).toBeVisible({ timeout: 45_000 });
      await peerSurface.getByRole('button', { name: 'Drop', exact: true }).click();
    })(),
  ]);
  await probe.waitForTerminalResult(session.gameId, dealerGameId, expected);
}

async function discardToCrib(page: Page): Promise<void> {
  const surface = page.locator('[data-authoritative-action-surface="cribbage-discard"]');
  await expect(surface).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('[data-cribbage-hand-card-key]:not(:disabled):visible');
  await expect(cards).toHaveCount(6, { timeout: 30_000 });
  await cards.nth(0).click({ timeout: 15_000 });
  await cards.nth(1).click({ timeout: 15_000 });
  await expect(surface).toHaveAccessibleName(/Send to Crib \(2\/2\)/);
  await surface.click({ timeout: 15_000 });
}

async function playCribbage(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  await Promise.all([discardToCrib(session.hostPage), discardToCrib(session.peerPage)]);
  const tryPlay = async (cards: Locator): Promise<boolean> => {
    if (!(await cards.count())) return false;
    const card = cards.first();
    if (!(await card.isEnabled({ timeout: 2_000 }).catch(() => false))) return false;
    try {
      await card.click({ timeout: 2_000 });
      return true;
    } catch {
      // Realtime can replace or disable the formerly playable card between
      // discovery and click. The next loop reads the new authoritative turn.
      return false;
    }
  };
  const describeGate = async (page: Page) => page
    .locator('[data-cribbage-hand-card-key]:visible')
    .evaluateAll((cards) => cards.slice(0, 1).map((card) => ({
      disabled: (card as HTMLButtonElement).disabled,
      playable: card.getAttribute('data-cribbage-card-playable'),
      processing: card.getAttribute('data-cribbage-block-processing'),
      interactions: card.getAttribute('data-cribbage-block-interactions'),
      boundary: card.getAttribute('data-cribbage-block-boundary'),
      selfPlay: card.getAttribute('data-cribbage-block-self-play'),
    }))[0] ?? null);
  let noActionStreak = 0;
  let lastProgress = await probe.readCribbageProgress(session.gameId, dealerGameId);
  let lastProgressAt = Date.now();
  for (let step = 0; step < 120; step += 1) {
    if (await isTerminal(session, probe, dealerGameId, expected)) return;
    const playableHost = session.hostPage.locator(
      '[data-cribbage-card-playable="1"]:not(:disabled):visible',
    );
    const playablePeer = session.peerPage.locator(
      '[data-cribbage-card-playable="1"]:not(:disabled):visible',
    );
    const acted = await tryPlay(playableHost) || await tryPlay(playablePeer);
    if (acted) {
      noActionStreak = 0;
    } else {
      noActionStreak += 1;
      if (noActionStreak >= 15) {
        const [hostGate, peerGate] = await Promise.all([
          describeGate(session.hostPage),
          describeGate(session.peerPage),
        ]);
        throw new Error(
          `Cribbage action gate remained blocked: host=${JSON.stringify(hostGate)} peer=${JSON.stringify(peerGate)}`,
        );
      }
      await pause(250);
    }
    const progress = await probe.readCribbageProgress(session.gameId, dealerGameId);
    if (
      progress.phase !== lastProgress.phase ||
      progress.eventSequence > lastProgress.eventSequence
    ) {
      lastProgress = progress;
      lastProgressAt = Date.now();
    } else if (progress.phase === 'pegging' && Date.now() - lastProgressAt >= 30_000) {
      const [hostGate, peerGate] = await Promise.all([
        describeGate(session.hostPage),
        describeGate(session.peerPage),
      ]);
      throw new Error(
        `Cribbage authoritative progress stalled at event ${progress.eventSequence}: ` +
        `host=${JSON.stringify(hostGate)} peer=${JSON.stringify(peerGate)}`,
      );
    }
  }
  throw new Error('Cribbage did not reach terminal settlement within 120 action checks');
}

type GinDomCard = GinRummyCard & { index: number };

async function chooseBestGinDiscard(page: Page): Promise<void> {
  const cards = await page.locator('[data-gin-hand-card-key]:not(:disabled):visible')
    .evaluateAll((nodes) => nodes.map((node) => ({
      index: Number(node.getAttribute('data-gin-card-index')),
      rank: node.getAttribute('data-gin-card-rank') ?? '',
      suit: node.getAttribute('data-gin-card-suit') ?? '',
      value: Number(node.getAttribute('data-gin-card-value')),
    })));
  if (cards.length !== 11) throw new Error(`Expected 11 selectable Gin cards, found ${cards.length}`);

  const ranked = cards.map((candidate) => {
    const remainder = cards.filter((card) => card.index !== candidate.index) as GinRummyCard[];
    return {
      candidate,
      deadwood: findOptimalMelds(remainder).deadwoodValue,
    };
  }).sort((left, right) => (
    left.deadwood - right.deadwood || right.candidate.value - left.candidate.value
  ));
  await page
    .locator(`[data-gin-card-index="${ranked[0].candidate.index}"]:not(:disabled):visible`)
    .click();
}

async function playGin(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  const pages = [session.hostPage, session.peerPage];
  let lastProgress = await probe.readGinProgress(session.gameId, dealerGameId);
  let lastProgressAt = Date.now();

  const waitForCommittedAction = async (previousActionCount: number) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const progress = await probe.readGinProgress(session.gameId, dealerGameId);
      if (progress.actionCount > previousActionCount) return progress;
      if (await isTerminal(session, probe, dealerGameId, expected)) return progress;
      await pause(200);
    }
    throw new Error(`Gin browser action did not commit after action ${previousActionCount}`);
  };

  for (let step = 0; step < 1_200; step += 1) {
    if (await isTerminal(session, probe, dealerGameId, expected)) return;
    let acted = false;
    let expectsCommittedAction = false;
    let actedSurface: Locator | null = null;
    for (const page of pages) {
      const firstDraw = page.locator('[data-authoritative-action-surface="gin-human-turn:first-draw"]:visible');
      const layOff = page.locator('[data-authoritative-action-surface="gin-human-turn:lay-off"]:visible');
      const select = page.locator('[data-authoritative-action-surface="gin-human-turn:select"]:visible');
      const discard = page.locator('[data-authoritative-action-surface="gin-human-turn:discard"]:visible');
      const draw = page.locator('[data-authoritative-action-surface="gin-human-turn:draw"]:visible');

      if (await firstDraw.count()) {
        const pass = firstDraw.getByRole('button', { name: 'Pass', exact: true });
        if (await pass.isEnabled()) {
          await pass.click();
          acted = true;
          expectsCommittedAction = true;
          actedSurface = firstDraw;
        }
      } else if (await layOff.count()) {
        const done = layOff.getByRole('button', { name: 'Done Laying Off', exact: true });
        if (await done.isEnabled()) {
          await done.click();
          acted = true;
          expectsCommittedAction = true;
          actedSurface = layOff;
        }
      } else if (await select.count()) {
        await chooseBestGinDiscard(page);
        acted = true;
      } else if (await discard.count()) {
        const gin = discard.getByRole('button', { name: /GIN!/ });
        const knock = discard.getByRole('button', { name: /Knock!/ });
        if (await gin.count()) await gin.click();
        else if (await knock.count()) await knock.click();
        else await discard.getByRole('button', { name: 'Discard', exact: true }).click();
        acted = true;
        expectsCommittedAction = true;
        actedSurface = discard;
      } else if (await draw.count()) {
        await page.locator('[data-gin-pile="stock"][data-gin-pile-layer="button"]').click();
        acted = true;
        expectsCommittedAction = true;
        actedSurface = draw;
      }
      if (acted) break;
    }

    if (acted && expectsCommittedAction) {
      const progress = await waitForCommittedAction(lastProgress.actionCount);
      lastProgress = progress;
      lastProgressAt = Date.now();
      if (actedSurface) {
        await expect(actedSurface).toBeHidden({ timeout: 15_000 });
      }
      continue;
    }

    await pause(acted ? 150 : 350);
    const progress = await probe.readGinProgress(session.gameId, dealerGameId);
    if (
      progress.phase !== lastProgress.phase ||
      progress.turnPhase !== lastProgress.turnPhase ||
      progress.actionCount > lastProgress.actionCount
    ) {
      lastProgress = progress;
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt >= 30_000) {
      const surfaces = await Promise.all(pages.map(async (page) => ({
        firstDraw: await page.locator('[data-authoritative-action-surface="gin-human-turn:first-draw"]:visible').count(),
        draw: await page.locator('[data-authoritative-action-surface="gin-human-turn:draw"]:visible').count(),
        select: await page.locator('[data-authoritative-action-surface="gin-human-turn:select"]:visible').count(),
        discard: await page.locator('[data-authoritative-action-surface="gin-human-turn:discard"]:visible').count(),
        layOff: await page.locator('[data-authoritative-action-surface="gin-human-turn:lay-off"]:visible').count(),
        enabledCards: await page.locator('[data-gin-hand-card-key]:not(:disabled):visible').count(),
      })));
      throw new Error(
        `Gin authoritative progress stalled at action ${progress.actionCount} ` +
        `(${progress.phase}/${progress.turnPhase}): ${JSON.stringify(surfaces)}`,
      );
    }
  }
  throw new Error('Gin Rummy did not reach terminal settlement within 1,200 action checks');
}

async function playDice(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  const pages = [session.hostPage, session.peerPage];
  for (let step = 0; step < 240; step += 1) {
    if (await isTerminal(session, probe, dealerGameId, expected)) return;
    let acted = false;
    for (const page of pages) {
      const surface = page.locator('[data-authoritative-action-surface="horses-scc-turn"]:visible');
      if (!(await surface.count())) continue;
      const lock = surface.getByRole('button', { name: 'Lock In', exact: true });
      const roll = surface.getByRole('button', { name: /^Roll \d+$/ });
      if (await lock.count()) await lock.first().click();
      else if (await roll.count()) await roll.click();
      else continue;
      acted = true;
      break;
    }
    await pause(acted ? 350 : 500);
  }
  throw new Error(`${expected.gameType} did not reach terminal settlement within 240 actions`);
}

async function playYahtzee(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  expected: TerminalExpectation,
): Promise<void> {
  const pages = [session.hostPage, session.peerPage];
  for (let step = 0; step < 500; step += 1) {
    if (await isTerminal(session, probe, dealerGameId, expected)) return;
    let acted = false;
    for (const page of pages) {
      const category = page.locator('[data-yahtzee-category-available="1"]:visible');
      if (await category.count()) {
        await category.first().click();
        const confirmZero = page.getByRole('button', { name: 'Yes, take 0', exact: true });
        if (await confirmZero.isVisible()) await confirmZero.click();
        acted = true;
        break;
      }
      const roll = page
        .locator('[data-authoritative-action-surface="yahtzee-turn"]:visible')
        .getByRole('button', { name: /^Roll \d+$/ });
      if (await roll.count()) {
        await roll.click();
        acted = true;
        break;
      }
    }
    await pause(acted ? 300 : 500);
  }
  throw new Error('Yahtzee did not reach terminal settlement within 500 actions');
}
