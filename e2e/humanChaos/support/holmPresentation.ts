import { expect, type Locator } from '@playwright/test';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import { TERMINAL_EXPECTATIONS } from '../../terminal/support/terminalActors';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import { formatChipValue } from '../../../src/lib/utils';
import { mutationProgressTarget } from './mutationProgress';
import { assertWinnerPayoutPresentation } from './winnerPayoutPresentation';
import type { PresentationScope, TransitionSample, TransitionPresentationObserver } from './transitionPresentation';

export async function armHolmPresentation(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('arm_target_rule_branch_harness' as never,
    { p_game_id: session.gameId, p_profile: 'holm:solo:win', p_ttl_seconds: 600 } as never);
  if (error || (data as any)?.outcome !== 'armed') throw new Error(`Could not arm exact Holm fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}

export async function clearHolmPresentationFixture(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('cancel_target_rule_branch_harness' as never,
    { p_game_id: session.gameId } as never);
  if (error || (data as any)?.outcome !== 'cancelled') throw new Error(`Could not cancel exact Holm fixture: ${error?.message ?? JSON.stringify(data)}`);
  return data;
}

export async function configureHolmPresentation(surface: Locator) {
  await surface.locator('#chucky').fill('4');
  await surface.locator('#ante-holm').fill('10');
  for (const label of ['Pussy Tax', 'Pot Max', 'Rabbit Hunt']) {
    const control = surface.getByText(label, { exact: true }).locator('..').locator('..').getByRole('switch');
    if (await control.getAttribute('aria-checked') === 'true') await control.click();
    await expect(control).toHaveAttribute('aria-checked', 'false');
  }
}

async function readRound(session: TwoClientSession, dealerGameId: string) {
  const { data, error } = await session.cleanupClient.from('rounds').select('id,hand_number,status,community_cards,chucky_cards')
    .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId).order('created_at', { ascending: false }).limit(1).single();
  if (error) throw error;
  return data;
}

async function decision(session: TwoClientSession, dealerGameId: string, choices: readonly ['Stay' | 'Fold', 'Stay' | 'Fold'], used: Set<string>) {
  if (!session.chaosObserver) throw new Error('Holm requires the continuous observer');
  let control: Locator | null = null;
  let role: 'host' | 'peer' = 'host';
  await expect.poll(async () => {
    for (const [index, candidateRole] of (['host', 'peer'] as const).entries()) {
      if (used.has(candidateRole)) continue;
      const page = candidateRole === 'host' ? session.hostPage : session.peerPage;
      const candidate = page.locator('[data-authoritative-action-surface="holm-357-decision"]:visible')
        .getByRole('button', { name: choices[index], exact: true });
      if (await candidate.count() === 1 && await candidate.isEnabled()) { control = candidate; role = candidateRole; return true; }
    }
    return false;
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(true);
  const responsePromise = control!.page().waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/rpc/holm_submit_decision'));
  const clickedAt = Date.now();
  await control!.click({ timeout: 6_000 });
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const request = response.request().postDataJSON();
  const receipt = await response.json();
  const target = mutationProgressTarget(new URL(response.url()).pathname, request, receipt);
  if (!target || target.field !== 'holmTurnSequence') throw new Error('Missing exact Holm decision receipt');
  const remaining = clickedAt + 6_000 - Date.now();
  if (remaining <= 0) throw new Error('Holm action exhausted six-second capture budget');
  await expect.poll(() => (['host', 'peer'] as const).every(client => {
    const snapshot = session.chaosObserver!.latestSnapshot(client);
    return snapshot?.gameId === session.gameId && snapshot.dealerGameId === dealerGameId
      && snapshot.roundId === target.roundId && snapshot.holmTurnSequence === target.value;
  }), { timeout: remaining, intervals: [25, 50, 100] }).toBe(true);
  expect(Date.now()).toBeLessThanOrEqual(clickedAt + 6_000);
  used.add(role);
  return { role, clickedAt, request, receipt, host: session.chaosObserver.latestSnapshot('host'), peer: session.chaosObserver.latestSnapshot('peer') };
}

/** Require actual card states, exact hand identity and a full normal Chucky flip. */
export function assertHolmReveals(samples: readonly TransitionSample[], scope: PresentationScope, startedAt: number, announcementAt: number) {
  const rows = samples.filter(row => row.at >= startedAt && row.at <= announcementAt
    && row.scope?.gameId === scope.gameId && row.scope.dealerGameId === scope.dealerGameId
    && row.scope.roundId === scope.roundId && row.scope.handNumber === scope.handNumber);
  const complete = rows.find(row => row.holmCards?.community.length === 4
    && row.holmCards.community.every(card => card.id.includes(scope.roundId) && card.face === 'face' && !card.flipping)
    && row.holmCards.chucky.length === 4 && row.holmCards.chucky.every(card => card.id.includes(scope.roundId) && card.state === 'revealed'));
  if (!complete) throw new Error('Holm winner preceded complete community and Chucky reveals');
  const flips = complete.holmCards!.chucky.map(card => {
    const first = rows.find(row => row.holmCards?.chucky.some(item => item.id === card.id && item.state === 'flipping'));
    const last = first && rows.find(row => row.at >= first.at && row.holmCards?.chucky.some(item => item.id === card.id && item.state === 'revealed'));
    // Mutation sampling has 20 ms tolerance; never substitute eventual face-up
    // state for the renderer's normal 600 ms flip.
    const rendered = first?.holmCards?.chucky.find(item => item.id === card.id);
    if (!first || !last || rendered?.durationMs !== 600 || last.at - first.at < 580) throw new Error(`Missing or shortened Holm Chucky flip: ${card.id}`);
    return { id: card.id, startedAt: first.at, completedAt: last.at, durationMs: last.at - first.at };
  });
  if (new Set(flips.map(flip => flip.id)).size !== 4) throw new Error('Duplicate Holm Chucky card identity');
  return { completedAt: complete.at, flips };
}

type Batch = { id: string; opening_balances: Record<string, number>; closing_balances: Record<string, number>;
  transfers: Array<{ id: string; amount: number; from: { kind: string; playerId?: string }; to: { kind: string; playerId?: string } }> };
const display = (balances: Record<string, number>) => Object.fromEntries(Object.entries(balances)
  .filter(([id]) => id.startsWith('player:')).map(([id, value]) => [id.slice(7), `$${formatChipValue(Math.round(value))}`]));

export function holmPayoutBalances(players: Array<{ id: string; chips: number }>, batch: Pick<Batch, 'opening_balances' | 'closing_balances'>) {
  const opening = Object.fromEntries(players.map(player => [`player:${player.id}`, player.chips]));
  if (players.length !== 2 || Object.keys(opening).length !== 2) throw new Error('Holm requires two exact pre-decision player balances');
  for (const [key, value] of Object.entries(batch.opening_balances)) {
    if (key.startsWith('player:') && opening[key] !== value) throw new Error('Holm payout opening disagrees with pre-decision balance');
  }
  return { opening: { ...opening, ...batch.opening_balances }, closing: { ...opening, ...batch.closing_balances } };
}

export async function playHolmPresentation(session: TwoClientSession, dealerGameId: string, probe: TerminalSettlementProbe,
  observers: Record<'host' | 'peer', TransitionPresentationObserver>, evidence: Record<string, unknown>) {
  const startedAt = Date.now();
  const before = await readRound(session, dealerGameId);
  const playersBefore = await session.cleanupClient.from('players').select('id,chips').eq('game_id', session.gameId);
  if (playersBefore.error) throw playersBefore.error;
  evidence.holmPlayersBefore = playersBefore.data;
  expect(before.community_cards).toHaveLength(4);
  expect(before.chucky_cards).toHaveLength(4);
  const actions = [];
  evidence.holmActions = actions;
  const used = new Set<string>();
  for (let i = 0; i < 2; i++) actions.push(await decision(session, dealerGameId, ['Stay', 'Fold'], used));
  const result = await probe.waitForTerminalResult(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS['holm-game'], 60_000);
  evidence.terminalResult = result;
  expect(result.winner_player_id).toBe(actions.find(action => action.role === 'host')!.request.p_player_id);
  expect(result.pot_won).toBe(20);
  const [transfers, game, fixture, playersAfter] = await Promise.all([
    session.cleanupClient.from('gameplay_transfer_batches' as never).select('id,opening_balances,closing_balances,transfers')
      .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId),
    session.cleanupClient.from('games').select('real_money,pending_session_end,status,last_round_result').eq('id', session.gameId).single(),
    session.cleanupClient.rpc('get_target_rule_branch_harness' as never, { p_game_id: session.gameId } as never),
    session.cleanupClient.from('players').select('id,chips').eq('game_id', session.gameId),
  ]);
  for (const query of [transfers, game, fixture, playersAfter]) if (query.error) throw query.error;
  evidence.holmPlayersAfter = playersAfter.data;
  expect(game.data).toMatchObject({ real_money: false, pending_session_end: false });
  expect(game.data!.status).not.toBe('session_ended');
  expect(fixture.data as unknown).toMatchObject({ outcome: 'ok', armed: false, profile: 'holm:solo:win', consumedDealerGameId: dealerGameId });
  expect((fixture.data as any).consumedAt).toBeTruthy();
  evidence.fixtureStatus = fixture.data;
  const batches = transfers.data as unknown as Batch[];
  evidence.holmBatches = batches;
  const payouts = batches.filter(batch => batch.transfers.some(transfer => transfer.from.kind === 'pot' && transfer.to.kind === 'player'));
  expect(payouts).toHaveLength(1);
  const batch = payouts[0];
  expect(batch.transfers).toHaveLength(1);
  const transfer = batch.transfers[0];
  expect(transfer).toMatchObject({ amount: 20, from: { kind: 'pot' }, to: { kind: 'player', playerId: result.winner_player_id } });
  expect(batch.closing_balances[`player:${result.winner_player_id}`] - batch.opening_balances[`player:${result.winner_player_id}`]).toBe(20);
  const sum = (balances: Record<string, number>) => Object.values(balances).reduce((a, b) => a + b, 0);
  expect(sum(batch.closing_balances)).toBeCloseTo(sum(batch.opening_balances), 8);
  // A pot payout journals only affected endpoints (pot and winner). Carry
  // the unchanged player's independently read balance through the proof.
  expect(Object.keys(batch.opening_balances).sort()).toEqual([`player:${result.winner_player_id}`, 'pot'].sort());
  const balances = holmPayoutBalances(playersBefore.data!, batch);
  expect(playersAfter.data).toHaveLength(2);
  for (const player of playersAfter.data!) expect(player.chips).toBe(balances.closing[`player:${player.id}`]);
  evidence.holmFullBalances = balances;
  const announcementId = `match_win:${session.gameId}:match:${game.data!.last_round_result!.split('|||')[0]}`;
  evidence.holmAnnouncementId = announcementId;
  const scope = { gameId: session.gameId, dealerGameId, roundId: before.id, handNumber: before.hand_number };
  for (const role of ['host', 'peer'] as const) {
    await expect.poll(() => observers[role].samples.some(row => row.at >= startedAt && row.setup), { timeout: 60_000 }).toBe(true);
    if (observers[role].overflow) throw new Error('Incomplete Holm presentation observation');
    const presentation = assertWinnerPayoutPresentation(observers[role].samples, { ...scope, startedAt, announcementId,
      // Holm releases its winner plate and ledger flight together after the
      // final reveal. The canonical skunk overlay is Cribbage-only.
      payoutKind: 'pot', simultaneousAnnouncement: true, transferIds: [transfer.id], openingBalances: display(balances.opening), closingBalances: display(balances.closing) });
    evidence[`${role}HolmPresentation`] = presentation;
    evidence[`${role}HolmReveals`] = assertHolmReveals(observers[role].samples, scope, startedAt, presentation.announcementAt);
  }
}

export async function playHolmSuccessor(session: TwoClientSession, dealerGameId: string, evidence: Record<string, unknown>) {
  const before = await readRound(session, dealerGameId);
  expect(before.hand_number).toBe(1);
  expect(before.status).toBe('betting');
  const cards = await session.cleanupClient.from('player_cards').select('player_id,cards').eq('round_id', before.id);
  if (cards.error) throw cards.error;
  expect(cards.data).toHaveLength(1); // Authenticated participant sees its own hand only.
  expect(cards.data[0].cards).toHaveLength(4);
  evidence.holmSuccessorPrivateCards = cards.data;
  for (const page of [session.hostPage, session.peerPage]) {
    const scope = JSON.parse(await page.locator('[data-holm-presentation-scope]').getAttribute('data-holm-presentation-scope') ?? 'null');
    expect(scope).toMatchObject({ gameId: session.gameId, dealerGameId, roundId: before.id, handNumber: 1 });
    await expect(page.locator('[data-canonical-announcement-type="match_win"], [data-chip-transport-intent][data-chip-transport-from="pot"]')).toHaveCount(0);
    await expect(page.locator('[data-holm-chucky-flip-state="flipping"], [data-holm-chucky-flip-state="revealed"]')).toHaveCount(0);
  }
  const actions = [];
  evidence.holmSuccessorActions = actions;
  const used = new Set<string>();
  for (let i = 0; i < 2; i++) actions.push(await decision(session, dealerGameId, ['Fold', 'Fold'], used));
  expect(used.size).toBe(2);
  return { before, actions };
}
