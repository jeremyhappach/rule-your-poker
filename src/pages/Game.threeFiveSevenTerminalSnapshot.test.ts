import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ThreeFiveSevenAuthoritativeSnapshot } from '@/lib/gameStateSync/threeFiveSevenProgress';
import { buildThreeFiveSevenRevealedFinancialPresentation, getThreeFiveSevenLegChargeAdmission } from '@/lib/threeFiveSeven/financialPresentation';

// Execute the actual pure builder without mounting Game's network/lifecycle owners.
const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const parsed = ts.createSourceFile('Game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node)
  && node.name?.text === 'buildThreeFiveSevenSnapshot')!;
const javascript = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const build = new Function(`${javascript}; return buildThreeFiveSevenSnapshot;`)() as
  (game: Record<string, unknown>, players: unknown[], round: Record<string, unknown> | null) => ThreeFiveSevenAuthoritativeSnapshot | null;

const game = {
  id: 'game-1', game_type: '3-5-7', status: 'session_ended',
  session_ended_at: '2026-09-21T21:49:50.636263+00:00', pending_session_end: false,
  current_game_uuid: 'dealer-1', total_hands: 1, current_round: 1,
  chip_transfer_cursor: 4, pot: 0, last_round_result: 'Winner won the game!',
  _authorityRevision: 16,
};
const round = { id: 'round-1', game_id: 'game-1', dealer_game_id: 'dealer-1',
  hand_number: 1, round_number: 1, status: 'completed', cards_dealt: 3 };

describe('3-5-7 atomic session-ended presentation snapshot', () => {
  it.each(['3-5-7', '357', '3-5-7-game'])('admits exact completed %s settlement without an intermediate game_over frame', game_type => {
    expect(build({ ...game, game_type }, [], round)).toMatchObject({
      roundId: 'round-1', dealerGameId: 'dealer-1', handNumber: 1, roundNumber: 1,
      roundStatus: 'completed', chipTransferCursor: 4, pot: 0,
      lastRoundResult: game.last_round_result, _authorityRevision: 16,
      _authorityScope: 'game-1', __syncHandNumber: 1,
    });
  });

  it('unblocks the exact leg-charge cursor only after the existing reveal completes', () => {
    const snapshot = build(game, [], round)!;
    const input = {
      gameId: snapshot._authorityScope, dealerGameId: snapshot.dealerGameId,
      roundId: snapshot.roundId, handNumber: snapshot.handNumber, roundNumber: snapshot.roundNumber,
      transferCursor: snapshot.chipTransferCursor, roundCompleted: snapshot.roundStatus === 'completed',
      revealBlocked: false, nowMs: 5300,
      revealClock: { serverOffsetMs: 0, window: {
        id: 'reveal-1', gameId: 'game-1', dealerGameId: 'dealer-1', roundId: 'round-1',
        handNumber: 1, roundNumber: 1, startedAtMs: 0, countdownAtMs: 1000,
        dropAtMs: 3700, endsAtMs: 5300, continuationAtMs: 9300,
      } },
    };
    const batch = { game_id: 'game-1', reason: 'leg' as const, cursor: 2 };
    expect(getThreeFiveSevenLegChargeAdmission(batch, buildThreeFiveSevenRevealedFinancialPresentation({ ...input, nowMs: 5299 }))).toBe(false);
    const receipt = buildThreeFiveSevenRevealedFinancialPresentation(input);
    expect(getThreeFiveSevenLegChargeAdmission(batch, receipt)).toBe(true);
    expect(getThreeFiveSevenLegChargeAdmission({ ...batch, cursor: 5 }, receipt)).toBe(false);
  });

  it.each([
    { status: 'betting' }, { game_id: 'other-game' }, { dealer_game_id: 'old-dealer' },
    { hand_number: 0 }, { hand_number: null }, { hand_number: 2 }, { round_number: 2 }, { id: '' },
  ])('rejects invalid or stale terminal round %j', patch => {
    expect(build(game, [], { ...round, ...patch })).toBeNull();
  });
  it.each([
    { session_ended_at: null }, { pending_session_end: true }, { current_game_uuid: null },
    { total_hands: null }, { current_round: null }, { game_type: 'horses' },
  ])('rejects incomplete terminal authority %j', patch => {
    expect(build({ ...game, ...patch }, [], round)).toBeNull();
  });
  it.each(['waiting', 'game_selection', 'dealer_selection', 'configuring'])('still rejects %s', status => {
    expect(build({ ...game, status }, [], round)).toBeNull();
  });
  it.each(['in_progress', 'game_over'])('preserves %s snapshot behavior', status => {
    expect(build({ ...game, status }, [], round)?.roundStatus).toBe('completed');
    expect(build({ ...game, status }, [], { ...round, status: 'betting' })?.roundStatus).toBe('betting');
  });
  it('keeps missing-round rejection and repeated-frame output stable', () => {
    expect(build(game, [], null)).toBeNull();
    expect(build(game, [], round)).toEqual(build(game, [], round));
  });
});
