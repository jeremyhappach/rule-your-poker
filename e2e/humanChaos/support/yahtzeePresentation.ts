import { expect, type Locator } from '@playwright/test';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import type { YahtzeeState } from '../../../src/lib/yahtzeeTypes';
import { getTotalScore } from '../../../src/lib/yahtzeeScoring';
import { formatChipValue } from '../../../src/lib/utils';
import type { TransitionPresentationObserver } from './transitionPresentation';
import { assertWinnerPayoutPresentation } from './winnerPayoutPresentation';

const PROFILE = 'yahtzee:terminal:unique';
export async function armYahtzeePresentation(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('arm_target_rule_branch_harness' as never,
    { p_game_id: session.gameId, p_profile: PROFILE, p_ttl_seconds: 600 } as never);
  if (error || (data as any)?.outcome !== 'armed') throw new Error(`Could not arm exact Yahtzee fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}
export async function clearYahtzeePresentationFixture(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('cancel_target_rule_branch_harness' as never, { p_game_id: session.gameId } as never);
  if (error || (data as any)?.outcome !== 'cancelled') throw new Error(`Could not clear exact Yahtzee fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}

async function readRound(session: TwoClientSession, dealerGameId: string) {
  const { data, error } = await session.cleanupClient.from('rounds').select('id,hand_number,yahtzee_state')
    .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId).order('created_at', { ascending: false }).limit(1).single();
  if (error) throw error;
  return { ...data, state: data.yahtzee_state as unknown as YahtzeeState };
}
async function waitForControl(session: TwoClientSession, selector: string, text?: RegExp): Promise<Locator> {
  let control: Locator | null = null;
  await expect.poll(async () => {
    for (const page of [session.hostPage, session.peerPage]) {
      const candidate = text ? page.locator(selector).getByRole('button', { name: text }) : page.locator(selector);
      if (await candidate.count() === 1 && await candidate.isVisible() && await candidate.isEnabled()) { control = candidate; return true; }
    }
    return false;
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
  if (!control) throw new Error('No legal Yahtzee control');
  return control;
}
async function actAndCapture(session: TwoClientSession, dealerGameId: string, control: Locator, action: 'roll' | 'score') {
  const before = await readRound(session, dealerGameId);
  const page = control.page();
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/rpc/yahtzee_apply_action')
    && response.request().postDataJSON()?._action === action);
  const clickedAt = Date.now();
  await control.click({ timeout: 6_000 });
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const request = response.request().postDataJSON();
  const receipt = await response.json();
  expect(request).toMatchObject({ _round_id: before.id, _player_id: before.state.currentTurnPlayerId, _action: action });
  expect(receipt).toMatchObject({ outcome: 'applied', action });
  const state = receipt.state as YahtzeeState;
  expect(state.actionSequence).toBe((before.state.actionSequence ?? 0) + 1);
  if (action === 'score') {
    expect(receipt.category).toBe('chance');
    expect(state.playerStates[request._player_id].scorecard.scores.chance).toBeGreaterThan(0);
  }
  const deadline = clickedAt + 6_000;
  const captures = [];
  for (const view of [session.hostPage, session.peerPage]) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Yahtzee action exhausted the six-second capture budget');
    let captured: any;
    await expect.poll(async () => {
      const raw = await view.locator('[data-yahtzee-presentation-scope]').getAttribute('data-yahtzee-presentation-scope');
      captured = JSON.parse(raw ?? 'null');
      return captured?.gameId === session.gameId && captured.dealerGameId === dealerGameId
        && captured.roundId === before.id && captured.actionSequence === state.actionSequence;
    }, { timeout: remaining, intervals: [25, 50, 100] }).toBe(true);
    captures.push({ at: Date.now(), scope: captured });
  }
  expect(Date.now()).toBeLessThanOrEqual(deadline);
  return { clickedAt, request, receipt, captures };
}
async function playTwoTurns(session: TwoClientSession, dealerGameId: string) {
  const actions = [];
  for (let turn = 0; turn < 2; turn++) {
    const roll = await waitForControl(session, '[data-authoritative-action-surface="yahtzee-turn"]:visible', /^Roll 1$/);
    actions.push(await actAndCapture(session, dealerGameId, roll, 'roll'));
    const chance = await waitForControl(session, '[data-yahtzee-category="chance"][data-yahtzee-category-available="1"]:visible');
    actions.push(await actAndCapture(session, dealerGameId, chance, 'score'));
  }
  expect(new Set(actions.filter(row => row.request._action === 'score').map(row => row.request._player_id)).size).toBe(2);
  return actions;
}

export async function playYahtzeePresentation(session: TwoClientSession, dealerGameId: string, probe: TerminalSettlementProbe,
  observers: Record<'host' | 'peer', TransitionPresentationObserver>, evidence: Record<string, unknown>) {
  const initial = await readRound(session, dealerGameId);
  expect(Object.values(initial.state.playerStates)).toHaveLength(2);
  for (const player of Object.values(initial.state.playerStates)) expect(Object.keys(player.scorecard.scores)).toHaveLength(12);
  const startedAt = Date.now();
  evidence.yahtzeeActions = await playTwoTurns(session, dealerGameId);
  const result = await probe.waitForTerminalResult(session.gameId, dealerGameId, { gameType: 'yahtzee', settlementKey: 'yahtzee_terminal' }, 60_000);
  const round = await readRound(session, dealerGameId);
  evidence.terminalResult = result;
  evidence.yahtzeeTerminal = round;
  expect(round.state.gamePhase).toBe('complete');
  const scores = Object.entries(round.state.playerStates).map(([id, player]) => {
    expect(Object.keys(player.scorecard.scores)).toHaveLength(13);
    return { id, score: getTotalScore(player.scorecard) };
  }).sort((a, b) => b.score - a.score);
  expect(scores[0].score).toBeGreaterThan(scores[1].score);
  expect(result.winner_player_id).toBe(scores[0].id);
  const { data, error } = await session.cleanupClient.from('gameplay_transfer_batches' as never)
    .select('id,opening_balances,closing_balances,transfers').eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId);
  if (error) throw error;
  const batches = data as any[];
  evidence.yahtzeeBatches = batches;
  const payouts = batches.filter(batch => batch.transfers.some((t: any) => t.from.kind === 'player' && t.to.kind === 'player'));
  expect(payouts).toHaveLength(1);
  const batch = payouts[0];
  expect(batch.transfers).toHaveLength(1);
  const sum = (balances: Record<string, number>) => Object.values(balances).reduce((total, value) => total + value, 0);
  expect(sum(batch.closing_balances)).toBeCloseTo(sum(batch.opening_balances), 8);
  const transfer = batch.transfers[0];
  const amount = Number((evidence.sourceConfig as Record<string, unknown>).ante_amount);
  expect(transfer).toMatchObject({ amount, from: { playerId: scores[1].id }, to: { playerId: scores[0].id } });
  expect(batch.closing_balances[`player:${scores[0].id}`] - batch.opening_balances[`player:${scores[0].id}`]).toBe(amount);
  expect(batch.closing_balances[`player:${scores[1].id}`] - batch.opening_balances[`player:${scores[1].id}`]).toBe(-amount);
  const display = (balances: Record<string, number>) => Object.fromEntries(Object.entries(balances).filter(([id]) => id.startsWith('player:'))
    .map(([id, amount]) => [id.slice(7), `$${formatChipValue(Math.round(amount))}`]));
  for (const role of ['host', 'peer'] as const) {
    await expect.poll(() => observers[role].samples.some(row => row.at >= startedAt && row.setup), { timeout: 60_000 }).toBe(true);
    if (observers[role].overflow) throw new Error('Incomplete Yahtzee observation');
    evidence[`${role}YahtzeePresentation`] = assertWinnerPayoutPresentation(observers[role].samples, {
      gameId: session.gameId, dealerGameId, roundId: round.id, handNumber: round.hand_number, startedAt,
      announcementId: `match_win:yahtzee-match:${dealerGameId}:${round.id}:${scores[0].id}:${scores[0].score}`,
      simultaneousAnnouncement: true, transferIds: [transfer.id],
      openingBalances: display(batch.opening_balances), closingBalances: display(batch.closing_balances),
    });
  }
  const [fixture, game] = await Promise.all([
    session.cleanupClient.rpc('get_target_rule_branch_harness' as never, { p_game_id: session.gameId } as never),
    session.cleanupClient.from('games').select('real_money,pending_session_end,status').eq('id', session.gameId).single(),
  ]);
  if (fixture.error || game.error) throw fixture.error ?? game.error;
  const fixtureStatus = fixture.data as unknown as { armed: boolean; profile: string; consumedAt: string };
  expect(fixtureStatus).toMatchObject({ armed: false, profile: PROFILE });
  expect(fixtureStatus.consumedAt).toBeTruthy();
  expect(game.data).toMatchObject({ real_money: false, pending_session_end: false });
  expect(game.data!.status).not.toBe('session_ended');
  evidence.fixtureStatus = fixture.data;
}

export async function playYahtzeeSuccessor(session: TwoClientSession, dealerGameId: string) {
  const before = await readRound(session, dealerGameId);
  for (const player of Object.values(before.state.playerStates)) expect(Object.keys(player.scorecard.scores)).toHaveLength(0);
  for (const page of [session.hostPage, session.peerPage]) {
    await expect(page.locator('[data-canonical-announcement-type="match_win"], [data-chip-transport-intent]')).toHaveCount(0);
  }
  const actions = await playTwoTurns(session, dealerGameId);
  const after = await readRound(session, dealerGameId);
  expect(after.id).toBe(before.id);
  expect(after.state.gamePhase).toBe('playing');
  for (const player of Object.values(after.state.playerStates)) expect(Object.keys(player.scorecard.scores)).toEqual(['chance']);
  return { actions, state: after.state };
}
