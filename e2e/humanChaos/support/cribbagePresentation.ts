import { expect } from '@playwright/test';
import { formatChipValue } from '../../../src/lib/utils';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import { discardToCrib, playDealerGameToTerminal } from '../../terminal/support/terminalActors';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import type { PresentationScope, TransitionSample, TransitionPresentationObserver } from './transitionPresentation';
import { mutationProgressTarget } from './mutationProgress';

export type CribbagePresentationExpectation = PresentationScope & {
  startedAt: number; winnerId: string; multiplier: number; transferIds: string[];
  openingBalances: Record<string, string>; closingBalances: Record<string, string>;
};

/** Settlement/setup cannot substitute for missing or cancelled visible transport. */
export function assertCribbagePresentation(samples: readonly TransitionSample[], expected: CribbagePresentationExpectation) {
  const fail = (why: string): never => { throw new Error(`Cribbage presentation ${expected.roundId}: ${why}`); };
  const rows = samples.filter(row => row.at >= expected.startedAt);
  const eventId = `${expected.gameId}:${expected.roundId}:match_win:${expected.winnerId}`;
  const same = (scope: PresentationScope | null) => scope?.gameId === expected.gameId
    && scope.dealerGameId === expected.dealerGameId && scope.roundId === expected.roundId
    && scope.handNumber === expected.handNumber;
  if (!rows.length || rows.some(row => !row.documentVisible)) fail('incomplete or hidden observation');
  const announcement = rows.find(row => row.matchWin?.id === eventId && row.matchWin.text.length > 0);
  if (!announcement || !same(announcement.scope)) fail('missing exact winner announcement');
  if (expected.multiplier >= 2 && !rows.some(row => row.celebration === eventId && same(row.scope))) fail('missing skunk celebration');
  const flights = new Map<string, { start: number; end: number | null }>();
  let previous = new Set<string>();
  for (const row of rows) {
    const current = new Set<string>();
    for (const stage of row.stages.filter(stage => stage.kind === 'payout')) {
      if (!same(row.scope) || !expected.transferIds.includes(stage.id)) fail('stale or unrelated payout');
      current.add(stage.id);
      const entry = flights.get(stage.id);
      if (entry && !previous.has(stage.id)) fail('duplicate payout');
      const flight = entry ?? { start: row.at, end: null };
      if (stage.finished && flight.end === null) flight.end = row.at;
      flights.set(stage.id, flight);
    }
    previous = current;
  }
  if (!expected.transferIds.length || flights.size !== expected.transferIds.length) fail('missing payout flight');
  for (const flight of flights.values()) {
    if (flight.start <= announcement!.at || flight.end === null) fail('payout preceded winner announcement or never finished');
    if (!rows.some(row => row.at >= announcement!.at && row.at < flight.start && row.matchWin?.id === eventId && !row.celebration)) fail('winner plate never visible before payout');
  }
  const payoutStart = Math.min(...[...flights.values()].map(flight => flight.start));
  const payoutEnd = Math.max(...[...flights.values()].map(flight => flight.end!));
  const setup = rows.find(row => row.setup);
  if (!setup || setup.at < payoutEnd) fail('missing setup or setup before payout completion');
  for (const [player, opening] of Object.entries(expected.openingBalances)) {
    if (rows.some(row => row.at >= announcement!.at && row.at < payoutStart && row.balances[player] != null && row.balances[player] !== opening)) fail('balance changed before payout');
  }
  for (const [player, closing] of Object.entries(expected.closingBalances)) {
    if (!rows.some(row => row.at >= payoutEnd && row.balances[player] === closing)) fail('missing final balance');
  }
  return { announcementAt: announcement!.at, payoutStart, payoutEnd, setupAt: setup.at };
}

type Batch = { id: string; reason: string; opening_balances: Record<string, number>; closing_balances: Record<string, number>;
  transfers: Array<{ id: string; amount: number; from: { kind: string; playerId?: string }; to: { kind: string; playerId?: string } }> };
const displayed = (balances: Record<string, number>) => Object.fromEntries(Object.entries(balances)
  .filter(([key]) => key.startsWith('player:')).map(([key, value]) => [key.slice(7), `$${formatChipValue(Math.round(value))}`]));

export async function playCribbagePresentation(session: TwoClientSession, dealerGameId: string, probe: TerminalSettlementProbe,
  observers: Record<'host' | 'peer', TransitionPresentationObserver>, evidence: Record<string, unknown>) {
  const startedAt = Date.now();
  const progress: unknown[] = [];
  const result = await playDealerGameToTerminal(session, 'cribbage', probe, dealerGameId,
    { onCribbageProgress: async value => { progress.push({ at: Date.now(), ...value }); } });
  evidence.terminalResult = result;
  evidence.cribbageProgress = progress;
  const [roundQuery, batchQuery, gameQuery] = await Promise.all([
    session.cleanupClient.from('rounds').select('id,hand_number,cribbage_state').eq('game_id', session.gameId)
      .eq('dealer_game_id', dealerGameId).eq('hand_number', result.hand_number).single(),
    session.cleanupClient.from('gameplay_transfer_batches' as never).select('id,reason,opening_balances,closing_balances,transfers')
      .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId).order('cursor'),
    session.cleanupClient.from('games').select('real_money,pending_session_end,status').eq('id', session.gameId).single(),
  ]);
  for (const query of [roundQuery, batchQuery, gameQuery]) if (query.error) throw query.error;
  expect(gameQuery.data).toMatchObject({ real_money: false, pending_session_end: false });
  expect(gameQuery.data!.status).not.toBe('session_ended');
  const round = roundQuery.data!;
  const state = round.cribbage_state as unknown as { winnerPlayerId: string; payoutMultiplier: number; phase: string; lastEvent?: unknown };
  const batches = batchQuery.data as unknown as Batch[];
  evidence.cribbageTerminal = { roundId: round.id, state, batches, game: gameQuery.data };
  expect(state.winnerPlayerId).toBe(result.winner_player_id);
  const payouts = batches.filter(batch => batch.transfers.some(transfer => transfer.from.kind === 'player' && transfer.to.kind === 'player'));
  expect(payouts).toHaveLength(1);
  const batch = payouts[0];
  expect(Object.keys(displayed(batch.opening_balances))).toHaveLength(2);
  expect(Object.values(batch.closing_balances).reduce((a, b) => a + b, 0))
    .toBeCloseTo(Object.values(batch.opening_balances).reduce((a, b) => a + b, 0), 8);
  expect(batch.transfers).toHaveLength(1);
  const transfer = batch.transfers[0];
  expect(transfer.to.playerId).toBe(result.winner_player_id);
  expect(transfer.from.playerId).not.toBe(result.winner_player_id);
  const expectedAmount = Number((evidence.sourceConfig as Record<string, unknown>).ante_amount) * (state.payoutMultiplier || 1);
  expect(expectedAmount).toBeGreaterThan(0);
  expect(transfer.amount).toBe(expectedAmount);
  expect(batch.closing_balances[`player:${transfer.to.playerId}`] - batch.opening_balances[`player:${transfer.to.playerId}`]).toBe(expectedAmount);
  expect(batch.closing_balances[`player:${transfer.from.playerId}`] - batch.opening_balances[`player:${transfer.from.playerId}`]).toBe(-expectedAmount);
  for (const role of ['host', 'peer'] as const) {
    await expect.poll(() => observers[role].samples.some(row => row.at >= startedAt && row.setup), { timeout: 60_000 }).toBe(true);
    if (observers[role].overflow) throw new Error('Incomplete Cribbage observation');
    evidence[`${role}CribbagePresentation`] = assertCribbagePresentation(observers[role].samples, {
      gameId: session.gameId, dealerGameId, roundId: round.id, handNumber: round.hand_number,
      startedAt, winnerId: result.winner_player_id!, multiplier: state.payoutMultiplier || 1,
      transferIds: batch.transfers.map(transfer => transfer.id),
      openingBalances: displayed(batch.opening_balances), closingBalances: displayed(batch.closing_balances),
    });
  }
}

export async function playCribbageSuccessor(session: TwoClientSession, dealerGameId: string) {
  if (!session.chaosObserver) throw new Error('Successor discards require the continuous observer');
  const captures = [];
  for (const page of [session.hostPage, session.peerPage]) {
    await expect(page.locator('[data-cribbage-hand-card-key]:visible')).toHaveCount(6);
    const scope = JSON.parse(await page.locator('[data-cribbage-presentation-scope]').getAttribute('data-cribbage-presentation-scope') ?? 'null');
    expect(scope).toMatchObject({ gameId: session.gameId, dealerGameId, phase: 'idle', winnerId: null });
    await expect(page.locator('[data-canonical-announcement-type="match_win"], [data-canonical-celebration-id], [data-chip-transport-intent]')).toHaveCount(0);
  }
  for (const [role, page] of [['host', session.hostPage], ['peer', session.peerPage]] as const) {
    const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rpc/cribbage_apply_discard'));
    await discardToCrib(page);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const request = response.request().postDataJSON();
    const receipt = await response.json();
    const target = mutationProgressTarget(new URL(response.url()).pathname, request, receipt);
    if (!target || target.field !== 'cribbageDiscard') throw new Error('Missing exact committed successor discard');
    // Wait for both exact projections before the next action/observer seal.
    await expect.poll(() => {
      const actor = session.chaosObserver!.latestSnapshot(role);
      const peer = session.chaosObserver!.latestSnapshot(role === 'host' ? 'peer' : 'host');
      return actor?.gameId === session.gameId && peer?.gameId === session.gameId
        && actor.dealerGameId === dealerGameId && peer.dealerGameId === dealerGameId
        && actor.roundId === target.roundId && peer.roundId === target.roundId
        && actor.cribbageSelfHandCount === 4 && peer.cribbageOpponentHandCounts?.[target.playerId] === 4;
    }, { timeout: 6_000, intervals: [25, 50, 100] }).toBe(true);
    captures.push({ role, request, receipt, host: session.chaosObserver.latestSnapshot('host'), peer: session.chaosObserver.latestSnapshot('peer') });
  }
  return captures;
}
