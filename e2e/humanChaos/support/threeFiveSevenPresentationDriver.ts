import { expect } from '@playwright/test';
import type { Database } from '../../../src/integrations/supabase/types';
import { parseThreeFiveSevenCurrentFrame } from '../../../src/lib/threeFiveSeven/currentFrame';
import { parseThreeFiveSevenDecisionRevealReceipt } from '../../../src/lib/threeFiveSeven/decisionReveal';
import { formatChipValue } from '../../../src/lib/utils';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import type { TerminalSettlementProbe } from '../../terminal/support/terminalSettlementProbe';
import { TransitionPresentationObserver } from './transitionPresentation';
import { mutationProgressTarget } from './mutationProgress';
import { waitForDecisionCapture } from './decisionCapture';

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

type DecisionRequest = {
  p_game_id: string; p_dealer_game_id: string; p_round_id: string;
  p_hand_number: number; p_round_number: number; p_player_id: string; p_decision: 'fold' | 'stay';
};

/** A committed decision acknowledges the write; its round is a concealed projection until DROP. */
export function assertSecureDecisionReceipt(request: DecisionRequest, receipt: any, startedAt: number, receivedAt: number) {
  expect(receipt).toMatchObject({ outcome: 'decision_committed', decision: request.p_decision,
    game: { id: request.p_game_id }, round: { id: request.p_round_id, game_id: request.p_game_id,
      dealer_game_id: request.p_dealer_game_id, hand_number: request.p_hand_number, round_number: request.p_round_number } });
  const target = mutationProgressTarget('/three_five_seven_submit_decision', request, receipt);
  const reveal = parseThreeFiveSevenDecisionRevealReceipt(receipt, startedAt, receivedAt);
  if (request.p_decision === 'stay') {
    expect(reveal?.window).toMatchObject({ id: `${request.p_dealer_game_id}:${request.p_round_id}`,
      gameId: request.p_game_id, dealerGameId: request.p_dealer_game_id, roundId: request.p_round_id,
      handNumber: request.p_hand_number, roundNumber: request.p_round_number });
  } else {
    expect(reveal).toBeNull();
  }
  const serverNow = Date.parse(receipt.server_now);
  expect(Number.isFinite(serverNow)).toBe(true);
  const concealed = !reveal || serverNow < reveal.window.dropAtMs;
  if (concealed) {
    expect(receipt.round.status).toBe('betting');
    expect(receipt.resolution).toBeNull();
    expect(receipt.game).toMatchObject({ awaiting_next_round: false, last_round_result: null, all_decisions_in: false });
    if (reveal) expect(receipt.decision_reveal.resolved_decisions).toBeNull();
    expect(target).toEqual({ field: 'decisionLocks', roundId: request.p_round_id, value: request.p_player_id });
  } else {
    // A delayed response may arrive after disclosure, but still needs the exact committed outcome.
    expect(target).toEqual({ field: 'roundStatus', roundId: request.p_round_id, value: 'completed' });
    expect(receipt.resolution).toMatchObject({ round_id: request.p_round_id, dealer_game_id: request.p_dealer_game_id });
    expect(reveal!.window.resolvedDecisions?.[request.p_player_id]).toBe(request.p_decision);
  }
  if (!target || (target.field !== 'decisionLocks' && target.field !== 'roundStatus')) {
    throw new Error('Decision has no exact committed mutation target');
  }
  return { target, reveal };
}

async function authorizedReveal(session: TwoClientSession, receipt: any, receivedAt: number, decisions: Record<string, 'fold' | 'stay'>) {
  const window = receipt.decision_reveal;
  // Wait from the server's remaining interval, then use its existing disclosure RPC.
  const remaining = Date.parse(window.drop_at) - Date.parse(receipt.server_now) - (Date.now() - receivedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  let disclosed: any;
  await expect.poll(async () => {
    const { data, error } = await session.cleanupClient.rpc('three_five_seven_read_reveal' as never, {
      p_game_id: session.gameId, p_dealer_game_id: window.dealer_game_id, p_round_id: window.round_id,
      p_hand_number: window.hand_number, p_round_number: window.round_number,
    } as never);
    if (error) throw error;
    disclosed = data;
    expect(disclosed.decision_reveal).toMatchObject({ id: window.id, game_id: session.gameId,
      dealer_game_id: window.dealer_game_id, round_id: window.round_id,
      hand_number: window.hand_number, round_number: window.round_number });
    if (Date.parse(disclosed.server_now) < Date.parse(disclosed.decision_reveal.drop_at)) {
      expect(disclosed.decision_reveal.resolved_decisions).toBeNull();
      return false;
    }
    expect(disclosed.decision_reveal.resolved_decisions).toEqual(decisions);
    return true;
  }, { timeout: 3_000, intervals: [100, 250] }).toBe(true);
  return disclosed;
}

export function assertDecidingLegProgress(
  identity: { hand_number: number | null; round_number: number | null; round_id: string | null },
  index: number,
  completedRoundIds: ReadonlySet<string>,
): void {
  // Five solo stays span all three rounds of hand 1 and rounds 1/2 of hand 2.
  const handNumber = Math.floor(index / 3) + 1;
  const roundNumber = index % 3 + 1;
  if (index < 0 || index > 4 || !Number.isInteger(index)
    || identity.hand_number !== handNumber || identity.round_number !== roundNumber
    || !identity.round_id || completedRoundIds.has(identity.round_id)) {
    throw new Error(`Unexpected deciding-leg progression at leg ${index + 1}: expected hand ${handNumber}, round ${roundNumber}, and a new round UUID`);
  }
}

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

export async function playSuccessorDecisionPair(session: TwoClientSession, dealerGameId: string) {
  if (!session.chaosObserver) throw new Error('Successor decisions require the continuous observer');
  const before = await frame(session);
  expect(before.identity.dealer_game_id).toBe(dealerGameId);
  const hostId = before.viewerPlayerId;
  const peerId = before.players.find(player => player.id !== hostId)?.id;
  if (!hostId || !peerId || !before.identity.round_id) throw new Error('Missing successor player or round identity');
  const captures = [];
  for (const page of [session.hostPage, session.peerPage]) {
    await expect(page.locator('[data-leg-award], [data-leg-sweep-flight], [data-sweep-the-legs-overlay]')).toHaveCount(0);
  }
  for (const [page, name, playerId] of [[session.hostPage, 'Drop', hostId], [session.peerPage, 'Stay', peerId]] as const) {
    const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rpc/three_five_seven_submit_decision'));
    const clickedAt = Date.now();
    await page.locator(surface).getByRole('button', { name, exact: true }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const request = response.request().postDataJSON();
    expect(request).toMatchObject({ p_game_id: session.gameId, p_dealer_game_id: dealerGameId,
      p_round_id: before.identity.round_id, p_hand_number: before.identity.hand_number,
      p_round_number: before.identity.round_number, p_player_id: playerId });
    expect(request.p_decision).toBe(name === 'Drop' ? 'fold' : 'stay');
    const receipt = await response.json();
    const receivedAt = Date.now();
    const { target } = assertSecureDecisionReceipt(request, receipt, clickedAt, receivedAt);
    captures.push(await waitForDecisionCapture(session.chaosObserver,
      { gameId: session.gameId, dealerGameId, roundId: before.identity.round_id }, target, clickedAt));
    if (name === 'Stay') await authorizedReveal(session, receipt, receivedAt, { [hostId]: 'fold', [peerId]: 'stay' });
  }
  const after = await frame(session);
  expect(after.identity.dealer_game_id).toBe(dealerGameId);
  expect(after.decisionReveal?.roundId).toBe(before.identity.round_id);
  return captures;
}

export async function playDecidingLegPresentation(
  session: TwoClientSession, winnerRole: 'host' | 'peer', probe: TerminalSettlementProbe,
  observers: { host: TransitionPresentationObserver; peer: TransitionPresentationObserver },
  evidence: Record<string, unknown>,
): Promise<void> {
  const continuousObserver = session.chaosObserver;
  if (!continuousObserver) throw new Error('Deciding-leg actions require the continuous observer');
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
  const completedRoundIds = new Set<string>();
  for (let index = 0; index < winningRoles.length; index++) {
    const terminal = index === 4;
    const winningRole = winningRoles[index];
    const losingRole = winningRole === 'host' ? 'peer' : 'host';
    const pages = { host: session.hostPage, peer: session.peerPage };
    await Promise.all(Object.values(pages).map(page => expect(page.locator(surface).getByRole('button', { name: 'Stay', exact: true })).toBeEnabled({ timeout: 60_000 })));
    const before = await frame(session);
    expect(before.identity.dealer_game_id).toBe(dealerGameId);
    assertDecidingLegProgress(before.identity, index, completedRoundIds);
    expect(before.game.legs_to_win).toBe(3);
    expect(before.game.leg_value).toBe(2);
    for (const player of before.players) expect(player.legs).toBe(expectedLegs[player.id]);
    for (const role of ['host', 'peer'] as const) {
      const player = before.players.find(player => player.id === ids[role])!;
      await expect(pages[role].locator(`[data-chip-delta-anchor="player:${player.id}"]:visible`).first()).toHaveText(displayed(player.chips));
    }
    const actionAt = Date.now();
    const roundEvidence: Record<string, any> = { index, roundId: before.identity.round_id,
      handNumber: before.identity.hand_number, roundNumber: before.identity.round_number,
      winner: ids[winningRole], actions: [], before: {
        players: before.players.map(({ id, chips, legs }) => ({ id, chips, legs })), pot: before.game.pot } };
    rounds.push(roundEvidence);
    // Capture actual stack opacity, not just the DROP label or eventual settlement.
    await Promise.all(Object.values(pages).map(page => page.evaluate(() => {
      const state = window as unknown as { __secure357Drop: { samples: any[]; timer: number } };
      if (state.__secure357Drop) clearInterval(state.__secure357Drop.timer);
      const samples: any[] = [];
      state.__secure357Drop = { samples, timer: window.setInterval(() => {
        const reveal = document.querySelector('[data-357-decision-reveal]');
        if (samples.length >= 2_000) return;
        samples.push({ at: Date.now(), round: reveal?.getAttribute('data-357-reveal-round'),
          beat: reveal?.getAttribute('data-357-reveal-beat'),
          stacks: [...document.querySelectorAll('[data-357-reveal-stack]')].map(element => ({
            id: element.getAttribute('data-357-reveal-stack'), decision: element.getAttribute('data-decision-visible'),
            opacity: Number(getComputedStyle(element).opacity),
          })) });
      }, 32) };
    })));
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
        p_dealer_game_id: dealerGameId, p_hand_number: before.identity.hand_number,
        p_round_number: before.identity.round_number, p_player_id: ids[role] });
      expect(request.p_decision).toBe(name === 'Drop' ? 'fold' : 'stay');
      const action = { receipt, startedAt, receivedAt, request, capture: null as unknown };
      roundEvidence.actions.push(action);
      const { target } = assertSecureDecisionReceipt(request, receipt, startedAt, receivedAt);
      const capture = await waitForDecisionCapture(continuousObserver,
        { gameId: session.gameId, dealerGameId, roundId: before.identity.round_id! }, target, startedAt);
      action.capture = capture;
      return action;
    };
    const losingAction = await clickDecision(losingRole, 'Drop');
    const winningAction = await clickDecision(winningRole, 'Stay');
    const reveal = parseThreeFiveSevenDecisionRevealReceipt(winningAction.receipt, winningAction.startedAt, winningAction.receivedAt);
    if (!reveal || reveal.window.roundId !== before.identity.round_id) throw new Error('Final legal action has no exact reveal receipt');
    roundEvidence.reveal = reveal.window;
    roundEvidence.authorizedReveal = await authorizedReveal(session, winningAction.receipt, winningAction.receivedAt,
      { [ids[losingRole]]: 'fold', [ids[winningRole]]: 'stay' });
    const after = await frame(session);
    expect(after.identity.round_id).toBe(before.identity.round_id);
    expect(after.round?.status).toBe('completed');
    expect(after.decisionReveal?.resolvedDecisions).toEqual({ [ids[losingRole]]: 'fold', [ids[winningRole]]: 'stay' });
    roundEvidence.after = { players: after.players.map(({ id, chips, legs, current_decision }) => ({ id, chips, legs, current_decision })), pot: after.game.pot };
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
    roundEvidence.batches = batches;
    await Promise.all(Object.values(pages).map(page => expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0, { timeout: 8_000 })));
    roundEvidence.dropSamples = {};
    for (const role of ['host', 'peer'] as const) {
      const samples = await pages[role].evaluate(() => {
        const state = (window as any).__secure357Drop;
        clearInterval(state.timer);
        return state.samples as Array<{ at: number; round: string; beat: string; stacks: Array<{ id: string; decision: string; opacity: number }> }>;
      });
      roundEvidence.dropSamples[role] = samples;
      const exact = samples.filter(sample => sample.round === before.identity.round_id);
      for (const beat of ['3', '2', '1']) {
        const hidden = exact.filter(sample => sample.beat === beat);
        expect(hidden.length, `${role}: missing countdown ${beat}`).toBeGreaterThan(0);
        expect(hidden.every(sample => sample.stacks.every(stack => stack.decision === 'locked' && stack.opacity === 1))).toBe(true);
      }
      const drop = exact.filter(sample => sample.beat === 'DROP');
      const folds = drop.flatMap(sample => sample.stacks.filter(stack => stack.id === ids[losingRole] && stack.decision === 'fold'));
      expect(folds.some(stack => stack.opacity > 0.1 && stack.opacity < 0.9), `${role}: folded stack did not visibly dissolve during DROP`).toBe(true);
      expect(folds.some(stack => stack.opacity < 0.15), `${role}: folded stack did not finish dissolving during DROP`).toBe(true);
      expect(drop.some(sample => sample.stacks.some(stack => stack.id === ids[winningRole] && stack.decision === 'stay' && stack.opacity === 1)), `${role}: staying stack incorrect`).toBe(true);
    }
    for (const role of ['host', 'peer'] as const) {
      // Destination and settled balances can paint in separate updates. Await
      // both before asserting the full timeline, without initiating progression.
      await expect.poll(() => {
        const rows = observers[role].samples.filter(row => row.at >= actionAt);
        const destinationObserved = terminal ? rows.some(row => row.setup)
          : rows.some(row => row.scope?.roundId && row.scope.roundId !== before.identity.round_id);
        const closingBalancesObserved = after.players.every(player => rows.some(row =>
          !row.reveal && row.balances[player.id] === displayed(player.chips)));
        return destinationObserved && closingBalancesObserved;
      }, { timeout: 60_000 }).toBe(true);
      roundEvidence[role] = observers[role].assert({
        gameId: session.gameId, dealerGameId, roundId: before.identity.round_id!, handNumber: before.identity.hand_number!,
        actionAt, revealId: reveal.window.id, revealServerEnd: reveal.window.endsAtMs, terminal,
        openingBalances: Object.fromEntries(before.players.map(player => [player.id, displayed(player.chips)])),
        closingBalances: Object.fromEntries(after.players.map(player => [player.id, displayed(player.chips)])), chargeBatchIds: charges.map(batch => batch.id),
        potTransferIds: potTransfers.map(transfer => transfer.id), sweepFlightCount: terminal ? 2 : undefined,
      });
    }
    completedRoundIds.add(before.identity.round_id!);
  }
}
