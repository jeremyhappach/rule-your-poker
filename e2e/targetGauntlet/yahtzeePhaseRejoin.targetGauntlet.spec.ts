import { expect, type Page } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { finalizeScenarioObserver, observerEvidenceSummary } from '../humanChaos/support/scenarioObserver';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import { persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, enterDealerGameUnderChaos } from '../liveness/support/twoClientSession';
import { authoritativeDealerGameId, requestLastHand } from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';

type State = { currentTurnPlayerId?: string; playerStates?: Record<string, { dice?: Array<{ isHeld?: boolean }>; scorecard?: { scores?: Record<string, number> } }> };
type Round = { id: string; hand_number: number; round_number: number; status: string; yahtzee_state?: State };

async function latestRound(session: Awaited<ReturnType<typeof createTwoClientSession>>, dealerGameId: string): Promise<Round> {
  const { data, error } = await session.cleanupClient.from('rounds').select('id,hand_number,round_number,status,yahtzee_state')
    .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId).order('hand_number', { ascending: false }).order('round_number', { ascending: false }).limit(1).single();
  if (error || !data) throw new Error(`Could not read Yahtzee round: ${error?.message ?? 'missing'}`);
  return data as unknown as Round;
}

async function remountPeer(session: Awaited<ReturnType<typeof createTwoClientSession>>, label: string): Promise<void> {
  await session.peerPage.close();
  session.peerPage = await session.peerContext.newPage();
  await session.peerPage.goto(`/game/${session.gameId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'yahtzee');
  await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
  await expect(session.peerPage.locator('[data-yahtzee-scorecard]').first(), `${label}: peer scorecard`).toBeVisible();
}

async function actorFor(session: Awaited<ReturnType<typeof createTwoClientSession>>, selector: string): Promise<Page> {
  for (const page of [session.hostPage, session.peerPage]) if (await page.locator(selector).count()) return page;
  throw new Error(`No Yahtzee actor rendered ${selector}`);
}

async function markPeerRemountAfterAction(actor: Page): Promise<void> {
  await actor.evaluate(() => {
    (window as unknown as Record<string, unknown>).__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__ = 'peer deliberately remounts for canonical hydration proof';
  });
}

async function prepareAndScore(session: Awaited<ReturnType<typeof createTwoClientSession>>, category: string): Promise<State> {
  const { data, error } = await session.cleanupClient.rpc('prepare_yahtzee_rule_branch_turn' as never, { p_game_id: session.gameId } as never);
  const outcome = (data as { outcome?: string } | null)?.outcome;
  if (error || (outcome !== 'prepared' && outcome !== 'already_prepared')) throw new Error(`Could not prepare Yahtzee score turn: ${error?.message ?? JSON.stringify(data)}`);
  await Promise.all([session.hostPage.reload({ waitUntil: 'domcontentloaded' }), session.peerPage.reload({ waitUntil: 'domcontentloaded' })]);
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'yahtzee');
  await remountPeer(session, 'score selection');
  const actor = await actorFor(session, `[data-yahtzee-category="${category}"][data-yahtzee-category-available="1"]:visible`);
  const response = actor.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/rest/v1/rpc/yahtzee_apply_action'));
  await markPeerRemountAfterAction(actor);
  await actor.locator(`[data-yahtzee-category="${category}"][data-yahtzee-category-available="1"]:visible`).click();
  const zero = actor.getByRole('button', { name: 'Yes, take 0', exact: true });
  if (await zero.isVisible()) await zero.click();
  const result = await response;
  const body = await result.json() as { outcome?: string; state?: State };
  if (!result.ok() || body.outcome !== 'applied' || !body.state) throw new Error(`Yahtzee ${category} score did not apply`);
  return body.state;
}

test('Yahtzee intra-turn peer remounts retain canonical state', async ({ browser }, info) => {
  test.setTimeout(12 * 60_000);
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const runtime = await session.hostNetwork.waitForRuntimeConfig();
  const probe = await TerminalSettlementProbe.create(runtime.url, runtime.publishableKey, credentials.player1);
  const evidence: Record<string, unknown> = { scenario: 'yahtzee-intra-turn-phase-rejoins', status: 'started', checkpoints: [] };
  let primaryError: unknown = null;
  let armed = false;
  try {
    const arm = await session.cleanupClient.rpc('arm_target_rule_branch_harness' as never, { p_game_id: session.gameId, p_profile: 'yahtzee:terminal:tie', p_ttl_seconds: 600 } as never);
    if (arm.error || (arm.data as { outcome?: string } | null)?.outcome !== 'armed') throw new Error(`Could not arm Yahtzee tie fixture: ${arm.error?.message ?? JSON.stringify(arm.data)}`);
    armed = true;
    await enterDealerGameUnderChaos(session, 'yahtzee');
    await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'yahtzee');
    const dealerGameId = await authoritativeDealerGameId(session);
    await requestLastHand(session, probe);

    await remountPeer(session, 'opening roll');
    (evidence.checkpoints as string[]).push('opening-roll');

    const opener = await actorFor(session, 'button:has-text("Roll 1")');
    await markPeerRemountAfterAction(opener);
    await opener.getByRole('button', { name: 'Roll 1', exact: true }).click();
    await expect(opener.getByRole('button', { name: 'Roll 2', exact: true })).toBeVisible({ timeout: 30_000 });
    await remountPeer(session, 'after first roll');
    (evidence.checkpoints as string[]).push('after-first-roll');

    const holder = await actorFor(session, 'button:has-text("Roll 2")');
    const dice = holder.locator('[data-yahtzee-active-pane-content] button:not([disabled])');
    await expect(dice.first()).toBeVisible();
    const holdResponse = holder.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/rest/v1/rpc/yahtzee_set_holds'));
    await markPeerRemountAfterAction(holder);
    await dice.first().click();
    await holdResponse;
    await expect.poll(async () => Object.values((await latestRound(session, dealerGameId)).yahtzee_state?.playerStates ?? {}).some((player) => player.dice?.some((die) => die.isHeld))).toBe(true);
    await remountPeer(session, 'after held dice');
    (evidence.checkpoints as string[]).push('after-hold');

    const handoff = await prepareAndScore(session, 'chance');
    const handoffTurn = handoff.currentTurnPlayerId;
    if (!handoffTurn) throw new Error('Yahtzee score did not assign a next turn');
    await remountPeer(session, 'turn handoff');
    expect((await latestRound(session, dealerGameId)).yahtzee_state?.currentTurnPlayerId).toBe(handoffTurn);
    (evidence.checkpoints as string[]).push('score-selection-and-handoff');

    evidence.status = 'passed';
  } catch (error) {
    primaryError = error;
    evidence.status = 'failed';
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      const observation = await finalizeScenarioObserver(session, info);
      evidence.continuousObserver = observerEvidenceSummary(observation.evidence);
      if (!primaryError && observation.failure) { primaryError = observation.failure; evidence.status = 'failed'; evidence.error = observation.failure.message; }
    } catch (error) { if (!primaryError) { primaryError = error; evidence.status = 'failed'; evidence.error = error instanceof Error ? error.message : String(error); } }
    if (armed) await session.cleanupClient.rpc('cancel_target_rule_branch_harness' as never, { p_game_id: session.gameId } as never);
    try { evidence.cleanup = await blastFakeMoneySession(session); }
    catch (error) { evidence.cleanup = { verified: false, error: error instanceof Error ? error.message : String(error) }; throw error; }
    finally { try { await persistScenarioEvidence(info, 'yahtzee-phase-rejoin-evidence.json', evidence); } finally { await closeTwoClientSession(session); } }
  }
  if (primaryError) throw primaryError;
});
