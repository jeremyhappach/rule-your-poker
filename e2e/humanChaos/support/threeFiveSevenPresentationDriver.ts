import { expect } from '@playwright/test';
import type { Database } from '../../../src/integrations/supabase/types';
import { parseThreeFiveSevenCurrentFrame } from '../../../src/lib/threeFiveSeven/currentFrame';
import { parseThreeFiveSevenDecisionRevealReceipt } from '../../../src/lib/threeFiveSeven/decisionReveal';
import { formatChipValue } from '../../../src/lib/utils';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import { TransitionPresentationObserver } from './transitionPresentation';

type Player = Database['public']['Tables']['players']['Row'];
type Game = Database['public']['Tables']['games']['Row'];
type Round = Database['public']['Tables']['rounds']['Row'];
type Batch = {
  id: string; cursor: number; reason: string;
  opening_balances: Record<string, number>; closing_balances: Record<string, number>;
  transfers: Array<{ id: string; amount: number; from: { kind: string }; to: { kind: string; playerId?: string } }>;
};
const surface = '[data-authoritative-action-surface="holm-357-decision"]';
const displayed = (amount: number) => `$${formatChipValue(Math.round(amount))}`;

async function frame(session: TwoClientSession) {
  const { data, error } = await session.cleanupClient.rpc('three_five_seven_current_frame' as never, { p_game_id: session.gameId } as never);
  if (error) throw error;
  const parsed = parseThreeFiveSevenCurrentFrame<Game, Round, Player>(data);
  if (parsed.game.real_money || parsed.players.length !== 2 || parsed.players.some(player => player.is_bot)) {
    throw new Error('Presentation qualification requires exactly two fake-money humans');
  }
  if (parsed.game.pending_session_end) throw new Error('Normal transition must not request End Session');
  return parsed;
}

export async function playSuccessorDecisionPair(session: TwoClientSession, dealerGameId: string): Promise<void> {
  const before = await frame(session);
  expect(before.identity.dealer_game_id).toBe(dealerGameId);
  for (const page of [session.hostPage, session.peerPage]) {
    await expect(page.locator('[data-leg-award], [data-leg-sweep-flight], [data-sweep-the-legs-overlay]')).toHaveCount(0);
  }
  for (const [page, name] of [[session.hostPage, 'Drop'], [session.peerPage, 'Stay']] as const) {
    const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rpc/three_five_seven_submit_decision'));
    await page.locator(surface).getByRole('button', { name, exact: true }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({ p_dealer_game_id: dealerGameId, p_round_id: before.identity.round_id });
  }
  const after = await frame(session);
  expect(after.identity.dealer_game_id).toBe(dealerGameId);
  expect(after.decisionReveal?.roundId).toBe(before.identity.round_id);
}

export async function playDecidingLegPresentation(
  session: TwoClientSession, winnerRole: 'host' | 'peer', probe: TerminalSettlementProbe,
  observers: { host: TransitionPresentationObserver; peer: TransitionPresentationObserver },
  evidence: Record<string, unknown>,
): Promise<void> {
  const rounds: unknown[] = [];
  evidence.rounds = rounds;
  const first = await frame(session);
  const hostId = first.viewerPlayerId;
  const peerId = first.players.find(player => player.id !== hostId)?.id;
  if (!hostId || !peerId || first.players.some(player => player.legs !== 0)) throw new Error('Unexpected opening roster or legs');
  const ids = { host: hostId, peer: peerId };
  const dealerGameId = first.identity.dealer_game_id!;
  const expectedLegs = { [hostId]: 0, [peerId]: 0 };
  const winningRoles = ['host', 'peer', 'host', 'peer', winnerRole] as const;
  for (let index = 0; index < winningRoles.length; index++) {
    const terminal = index === 4;
    const winningRole = winningRoles[index];
    const losingRole = winningRole === 'host' ? 'peer' : 'host';
    const pages = { host: session.hostPage, peer: session.peerPage };
    await Promise.all(Object.values(pages).map(page => expect(page.locator(surface).getByRole('button', { name: 'Stay', exact: true })).toBeEnabled({ timeout: 60_000 })));
    const before = await frame(session);
    expect(before.identity.dealer_game_id).toBe(dealerGameId);
    expect(before.identity.round_number).toBe(1);
    expect(before.game.legs_to_win).toBe(3);
    expect(before.game.leg_value).toBe(2);
    for (const player of before.players) expect(player.legs).toBe(expectedLegs[player.id]);
    for (const role of ['host', 'peer'] as const) {
      const player = before.players.find(player => player.id === ids[role])!;
      await expect(pages[role].locator(`[data-chip-delta-anchor="player:${player.id}"]:visible`).first()).toHaveText(displayed(player.chips));
    }
    const actionAt = Date.now();
    const clickDecision = async (role: 'host' | 'peer', name: 'Stay' | 'Drop') => {
      const responsePromise = pages[role].waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/rpc/three_five_seven_submit_decision'));
      const startedAt = Date.now();
      await pages[role].locator(surface).getByRole('button', { name, exact: true }).click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      const receipt = await response.json();
      const receivedAt = Date.now();
      const request = response.request().postDataJSON();
      expect(request).toMatchObject({ p_game_id: session.gameId, p_round_id: before.identity.round_id,
        p_dealer_game_id: dealerGameId, p_hand_number: before.identity.hand_number, p_player_id: ids[role] });
      return { receipt, startedAt, receivedAt, request };
    };
    const losingAction = await clickDecision(losingRole, 'Drop');
    const winningAction = await clickDecision(winningRole, 'Stay');
    const reveal = parseThreeFiveSevenDecisionRevealReceipt(winningAction.receipt, winningAction.startedAt, winningAction.receivedAt);
    if (!reveal || reveal.window.roundId !== before.identity.round_id) throw new Error('Final legal action has no exact reveal receipt');
    const after = await frame(session);
    expect(after.identity.round_id).toBe(before.identity.round_id);
    const { data, error } = await session.cleanupClient.from('gameplay_transfer_batches' as never)
      .select('id,cursor,reason,opening_balances,closing_balances,transfers')
      .eq('game_id', session.gameId).eq('dealer_game_id', dealerGameId)
      .gt('cursor', before.identity.chip_transfer_cursor).lte('cursor', after.identity.chip_transfer_cursor).order('cursor');
    if (error) throw error;
    const batches = data as unknown as Batch[];
    const charges = batches.filter(batch => batch.reason === 'leg');
    expect(charges).toHaveLength(1);
    const charge = charges[0];
    expect(charge.transfers).toHaveLength(0);
    expect(charge.closing_balances[`player:${ids[winningRole]}`] - charge.opening_balances[`player:${ids[winningRole]}`]).toBe(-2);
    const potTransfers = batches.flatMap(batch => batch.transfers).filter(transfer => transfer.from.kind === 'pot');
    const beforeTotal = before.players.reduce((sum, player) => sum + player.chips + player.legs * 2, before.game.pot ?? 0);
    const afterTotal = after.players.reduce((sum, player) => sum + player.chips + player.legs * 2, after.game.pot ?? 0);
    expect(afterTotal).toBeCloseTo(beforeTotal, 8);
    expectedLegs[ids[winningRole]]++;
    if (!terminal) {
      expect(after.game.pot).toBe(before.game.pot);
      expect(potTransfers).toHaveLength(0);
      for (const player of after.players) expect(player.legs).toBe(expectedLegs[player.id]);
    } else {
      const result = await probe.findTerminalResult(session.gameId, dealerGameId, { gameType: '3-5-7', settlementKey: 'three_five_seven_terminal' });
      expect(result?.winner_player_id).toBe(ids[winningRole]);
      expect(result?.hand_number).toBe(before.identity.hand_number);
      expect(after.game.pot).toBe(0);
      expect(potTransfers).toHaveLength(1);
      expect(potTransfers[0]).toMatchObject({ amount: before.game.pot, to: { kind: 'player', playerId: ids[winningRole] } });
      evidence.terminalResult = result;
    }
    const roundEvidence: Record<string, unknown> = { index, roundId: before.identity.round_id, handNumber: before.identity.hand_number,
      winner: ids[winningRole], before: { players: before.players.map(({ id, chips, legs }) => ({ id, chips, legs })), pot: before.game.pot },
      after: { players: after.players.map(({ id, chips, legs }) => ({ id, chips, legs })), pot: after.game.pot },
      actions: [losingAction, winningAction], reveal: reveal.window, batches };
    rounds.push(roundEvidence);
    for (const role of ['host', 'peer'] as const) {
      // Wait for the observed destination, without initiating it. This never
      // requests End Session and cannot erase a slow client's presentation.
      await expect.poll(() => {
        const rows = observers[role].samples.filter(row => row.at >= actionAt);
        return terminal ? rows.some(row => row.setup) : rows.some(row => row.scope?.roundId && row.scope.roundId !== before.identity.round_id);
      }, { timeout: 60_000 }).toBe(true);
      roundEvidence[role] = observers[role].assert({
        gameId: session.gameId, dealerGameId, roundId: before.identity.round_id!, handNumber: before.identity.hand_number!,
        actionAt, revealId: reveal.window.id, revealServerEnd: reveal.window.endsAtMs, terminal,
        openingBalances: Object.fromEntries(before.players.map(player => [player.id, displayed(player.chips)])),
        closingBalances: Object.fromEntries(after.players.map(player => [player.id, displayed(player.chips)])), chargeBatchIds: charges.map(batch => batch.id),
        potTransferIds: potTransfers.map(transfer => transfer.id), sweepFlightCount: terminal ? 2 : undefined,
      });
    }
  }
}
