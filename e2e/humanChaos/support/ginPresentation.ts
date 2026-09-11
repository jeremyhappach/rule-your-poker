import { expect, type Locator } from '@playwright/test';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import { TERMINAL_EXPECTATIONS } from '../../terminal/support/terminalActors';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import type { GinRummyState } from '../../../src/lib/ginRummyTypes';
import { formatChipValue } from '../../../src/lib/utils';
import { mutationProgressTarget } from './mutationProgress';
import { assertWinnerPayoutPresentation } from './winnerPayoutPresentation';
import type { TransitionPresentationObserver } from './transitionPresentation';

const surface = (phase: string) => `[data-authoritative-action-surface="gin-human-turn:${phase}"]:visible`;

export function ginWinnerLabelEvidence(text: string, expectedAmount: number) {
  const displayedAmount = Number(text.match(/·\s*\+\$?([\d,]+(?:\.\d+)?)\s*$/)?.[1]?.replaceAll(',', ''));
  return { text, expectedAmount, displayedAmount, matches: displayedAmount === expectedAmount };
}

export async function armGinPresentation(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('arm_gin_rule_branch_harness' as never,
    { p_game_id: session.gameId, p_profile: 'gin', p_ttl_seconds: 600 } as never);
  if (error || (data as any)?.outcome !== 'armed') throw new Error(`Could not arm exact Gin fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}

export async function clearGinPresentationFixture(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('cancel_gin_rule_branch_harness' as never,
    { p_game_id: session.gameId } as never);
  if (error || (data as any)?.outcome !== 'cancelled') throw new Error(`Could not cancel exact Gin fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}

async function readRound(session: TwoClientSession, dealerGameId: string) {
  const { data, error } = await session.cleanupClient.from('rounds').select('id,hand_number,gin_rummy_state')
    .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId).order('created_at', { ascending: false }).limit(1).single();
  if (error) throw error;
  return { ...data, state: data.gin_rummy_state as unknown as GinRummyState };
}

async function actor(session: TwoClientSession, phase: string) {
  let found: Locator | null = null;
  await expect.poll(async () => {
    const candidates = [];
    for (const page of [session.hostPage, session.peerPage]) {
      const candidate = page.locator(surface(phase));
      if (await candidate.count() === 1 && await candidate.isVisible()) candidates.push(candidate);
    }
    found = candidates.length === 1 ? candidates[0] : null;
    return Boolean(found);
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
  return found!;
}

/** Pace scripted actions to retain each exact committed projection on both clients. */
async function act(session: TwoClientSession, dealerGameId: string, control: Locator) {
  if (!session.chaosObserver) throw new Error('Gin capture requires the continuous observer');
  const responsePromise = control.page().waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/rpc/gin_rummy_apply_action'));
  const clickedAt = Date.now();
  await control.click({ timeout: 6_000 });
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const request = response.request().postDataJSON();
  const receipt = await response.json();
  const target = mutationProgressTarget(new URL(response.url()).pathname, request, receipt);
  if (!target || target.field !== 'ginActionCount') throw new Error('Missing exact committed Gin action receipt');
  const remaining = clickedAt + 6_000 - Date.now();
  if (remaining <= 0) throw new Error('Gin action exhausted the six-second capture budget');
  await expect.poll(() => (['host', 'peer'] as const).every(role => {
    const snapshot = session.chaosObserver!.latestSnapshot(role);
    return snapshot?.gameId === session.gameId && snapshot.dealerGameId === dealerGameId
      && snapshot.roundId === target.roundId && snapshot.ginActionCount === target.value;
  }), { timeout: remaining, intervals: [25, 50, 100] }).toBe(true);
  expect(Date.now()).toBeLessThanOrEqual(clickedAt + 6_000);
  return { clickedAt, request, receipt, host: session.chaosObserver.latestSnapshot('host'), peer: session.chaosObserver.latestSnapshot('peer') };
}

type Batch = { id: string; opening_balances: Record<string, number>; closing_balances: Record<string, number>;
  transfers: Array<{ id: string; amount: number; from: { kind: string; playerId?: string }; to: { kind: string; playerId?: string } }> };
const display = (balances: Record<string, number>) => Object.fromEntries(Object.entries(balances)
  .filter(([id]) => id.startsWith('player:')).map(([id, value]) => [id.slice(7), `$${formatChipValue(Math.round(value))}`]));

export async function playGinPresentation(session: TwoClientSession, dealerGameId: string, probe: TerminalSettlementProbe,
  observers: Record<'host' | 'peer', TransitionPresentationObserver>, evidence: Record<string, unknown>) {
  const startedAt = Date.now();
  const actions = [];
  let first = await actor(session, 'first-draw');
  // The existing fixture targets one authoritative player with K-clubs as the discard.
  const targetCard = (page: TwoClientSession['hostPage']) => page.getByRole('button', { name: 'K ♣', exact: true });
  await expect.poll(async () => await targetCard(session.hostPage).count() + await targetCard(session.peerPage).count()).toBe(1);
  const targetPage = await targetCard(session.hostPage).count() === 1 ? session.hostPage : session.peerPage;
  if (first.page() !== targetPage) {
    actions.push(await act(session, dealerGameId, first.getByRole('button', { name: 'Pass', exact: true })));
    first = await actor(session, 'first-draw');
  }
  expect(first.page()).toBe(targetPage);
  actions.push(await act(session, dealerGameId, first.getByRole('button', { name: 'Take', exact: true })));
  const select = await actor(session, 'select');
  expect(select.page()).toBe(targetPage);
  await targetCard(targetPage).click();
  const discard = await actor(session, 'discard');
  actions.push(await act(session, dealerGameId, discard.getByRole('button', { name: /GIN!/ })));
  evidence.ginActions = actions;
  const result = await probe.waitForTerminalResult(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS['gin-rummy'], 60_000);
  const round = await readRound(session, dealerGameId);
  evidence.terminalResult = result;
  evidence.ginTerminal = round;
  expect(round.state.phase).toBe('complete');
  expect(round.state.knockResult).toMatchObject({ isGin: true, isUndercut: false, knockerDeadwood: 0 });
  const winner = result.winner_player_id!;
  expect(round.state.winnerPlayerId).toBe(winner);
  const loser = Object.keys(round.state.matchScores).find(id => id !== winner)!;
  expect(round.state.matchScores[winner]).toBeGreaterThanOrEqual(round.state.pointsToWin);
  const source = evidence.sourceConfig as Record<string, number>;
  expect(source).toMatchObject({ ante_amount: 10, per_point_value: 1, points_to_win: 50 });
  const amount = source.ante_amount + (round.state.matchScores[winner] - round.state.matchScores[loser]) * source.per_point_value;
  expect(amount).toBeGreaterThan(source.ante_amount);
  const [transfers, game, fixture] = await Promise.all([
    session.cleanupClient.from('gameplay_transfer_batches' as never).select('id,opening_balances,closing_balances,transfers')
      .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId),
    session.cleanupClient.from('games').select('real_money,pending_session_end,status').eq('id', session.gameId).single(),
    session.cleanupClient.rpc('get_gin_rule_branch_harness' as never, { p_game_id: session.gameId } as never),
  ]);
  for (const query of [transfers, game, fixture]) if (query.error) throw query.error;
  expect(game.data).toMatchObject({ real_money: false, pending_session_end: false });
  expect(game.data!.status).not.toBe('session_ended');
  expect(fixture.data as unknown).toMatchObject({ outcome: 'ok', armed: false, profile: 'gin' });
  expect((fixture.data as any).consumedAt).toBeTruthy();
  evidence.fixtureStatus = fixture.data;
  const batches = transfers.data as unknown as Batch[];
  evidence.ginBatches = batches;
  const payouts = batches.filter(batch => batch.transfers.some(t => t.from.kind === 'player' && t.to.kind === 'player'));
  expect(payouts).toHaveLength(1);
  const batch = payouts[0];
  expect(batch.transfers).toHaveLength(1);
  const transfer = batch.transfers[0];
  expect(transfer).toMatchObject({ amount, from: { playerId: loser }, to: { playerId: winner } });
  expect(batch.closing_balances[`player:${winner}`] - batch.opening_balances[`player:${winner}`]).toBe(amount);
  expect(batch.closing_balances[`player:${loser}`] - batch.opening_balances[`player:${loser}`]).toBe(-amount);
  expect(Object.keys(display(batch.opening_balances))).toHaveLength(2);
  const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
  expect(sum(batch.closing_balances)).toBeCloseTo(sum(batch.opening_balances), 8);
  for (const role of ['host', 'peer'] as const) {
    await expect.poll(() => observers[role].samples.some(row => row.at >= startedAt && row.setup), { timeout: 60_000 }).toBe(true);
    if (observers[role].overflow) throw new Error('Incomplete Gin presentation observation');
    evidence[`${role}GinPresentation`] = assertWinnerPayoutPresentation(observers[role].samples, {
      gameId: session.gameId, dealerGameId, roundId: round.id, handNumber: round.hand_number, startedAt,
      announcementId: `${session.gameId}:${dealerGameId}:match_win:${winner}`, transferIds: [transfer.id],
      openingBalances: display(batch.opening_balances), closingBalances: display(batch.closing_balances),
    });
    const label = observers[role].samples.find(row => row.at >= startedAt
      && row.matchWin?.id === `${session.gameId}:${dealerGameId}:match_win:${winner}`)?.matchWin?.text ?? '';
    evidence[`${role}GinWinnerLabel`] = ginWinnerLabelEvidence(label, amount);
  }
}

export async function playGinSuccessor(session: TwoClientSession, dealerGameId: string, evidence: Record<string, unknown>) {
  const before = await readRound(session, dealerGameId);
  expect(before.hand_number).toBe(1);
  expect(Object.values(before.state.matchScores)).toEqual([0, 0]);
  for (const page of [session.hostPage, session.peerPage]) {
    await expect(page.locator('[data-gin-hand-card-key]:visible')).toHaveCount(10);
    const scope = JSON.parse(await page.locator('[data-gin-presentation-scope]').getAttribute('data-gin-presentation-scope') ?? 'null');
    expect(scope).toMatchObject({ gameId: session.gameId, dealerGameId, roundId: before.id, handNumber: 1 });
    await expect(page.locator('[data-canonical-announcement-type="match_win"], [data-chip-transport-intent]')).toHaveCount(0);
    await expect(page.locator('[data-artifact-id="gin.knockDisplay"]:visible')).toHaveCount(0);
  }
  const actions = [];
  evidence.ginSuccessorActions = actions;
  for (let pass = 0; pass < 2; pass++) {
    const first = await actor(session, 'first-draw');
    actions.push(await act(session, dealerGameId, first.getByRole('button', { name: 'Pass', exact: true })));
  }
  // The second pass already draws from stock for the nondealer. Prove that
  // committed opening instead of waiting for an extra, illegal draw control.
  const opening = await readRound(session, dealerGameId);
  expect(opening.id).toBe(before.id);
  expect(opening.state).toMatchObject({ phase: 'playing', turnPhase: 'discard', drawSource: 'stock',
    currentTurnPlayerId: opening.state.nonDealerPlayerId, lastAction: { type: 'draw_stock', playerId: opening.state.nonDealerPlayerId } });
  expect(opening.state.playerStates[opening.state.nonDealerPlayerId].hand).toHaveLength(11);
  evidence.ginSuccessorOpening = opening;
  for (let turn = 0; turn < 2; turn++) {
    if (turn > 0) {
      const draw = await actor(session, 'draw');
      actions.push(await act(session, dealerGameId, draw.page().locator('[data-gin-pile="stock"][data-gin-pile-layer="button"]')));
    }
    const select = await actor(session, 'select');
    await expect(select.page().locator('[data-gin-hand-card-key]:visible')).toHaveCount(11);
    await select.page().locator('[data-gin-hand-card-key]:not(:disabled):visible').first().click();
    const discard = await actor(session, 'discard');
    actions.push(await act(session, dealerGameId, discard.getByRole('button', { name: 'Discard', exact: true })));
  }
  const discards = actions.filter(row => row.request._action === 'discard');
  expect(discards).toHaveLength(2);
  expect(new Set(discards.map(row => row.request._player_id)).size).toBe(2);
  const after = await readRound(session, dealerGameId);
  expect(after.id).toBe(before.id);
  expect(after.state.winnerPlayerId ?? null).toBeNull();
  expect(Object.values(after.state.matchScores)).toEqual([0, 0]);
  return { actions, round: after };
}
