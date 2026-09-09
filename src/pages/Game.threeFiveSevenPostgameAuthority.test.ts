import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const handler = source.slice(
  source.indexOf('const handleGameOverComplete = useCallback'),
  source.indexOf('// Dealer confirms to skip countdown'),
);

describe('Game 3-5-7 authoritative postgame handoff', () => {
  it('calls the exact postgame RPC without shared browser leader/evaluation work', () => {
    const branchIndex = handler.indexOf("if (is357GameType) {");
    const rpcIndex = handler.indexOf("'three_five_seven_advance_postgame' as any");
    const leaderIndex = handler.indexOf('// P0 GUARD (MUT-02): Single-executor leader election.');
    const evaluationIndex = handler.indexOf('await evaluatePlayerStatesEndOfGame(gameId)');

    expect(branchIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(branchIndex);
    expect(leaderIndex).toBe(-1);
    expect(evaluationIndex).toBe(-1);
  });

  it('consumes the committed result directly and never uses a round number as a diagnostic UUID', () => {
    const branch = handler.slice(
      handler.indexOf("if (is357GameType) {"),
      handler.indexOf('// Unknown/stale game types'),
    );

    expect(branch).toContain('await fetchGameData()');
    expect(branch).toContain(".includes(postgame?.outcome ?? '')");
    expect(handler).toContain('? currentRound.id');
    expect(handler).not.toContain('roundId: game?.current_round != null ? String(game.current_round)');
  });

  it('retains the route-owned terminal trigger until the real completion callback', () => {
    const started = source.slice(
      source.indexOf('const handleThreeFiveSevenWinAnimationStarted = useCallback'),
      source.indexOf('// Handle 3-5-7 win animation complete'),
    );
    const completed = source.slice(
      source.indexOf('const handleThreeFiveSevenWinAnimationComplete = useCallback'),
      source.indexOf('// YAHTZEE game_over transition'),
    );

    expect(started).not.toContain('setThreeFiveSevenWinTriggerId(null)');
    expect(completed).toContain('setThreeFiveSevenWinTriggerId(null)');
  });

  it('requires exact presentation completion before the RPC and removes premature timer owners', () => {
    const permission = handler.indexOf('!canAdvance357Postgame(completion357)');
    expect(permission).toBeGreaterThan(-1);
    expect(permission).toBeLessThan(handler.indexOf("'three_five_seven_advance_postgame' as any"));
    expect(handler).toContain('const terminalRoundId = completion357!.roundId;');
    expect(source).not.toContain('poll357IntervalRef');
    expect(source).not.toContain('safety357FallbackTimerRef');
    const callback = source.slice(source.indexOf('const handleThreeFiveSevenWinAnimationComplete'),
      source.indexOf('// YAHTZEE game_over transition'));
    expect(callback.indexOf('!accept357TerminalCompletion(completion)'))
      .toBeLessThan(callback.indexOf('setIs357WinAnimationActive(false)'));
    expect(callback).toContain('await handleGameOverComplete(completion)');
    expect(callback).not.toContain('freshGame');
    const table = readFileSync(join(__dirname, '..', 'components', 'MobileGameTable.tsx'), 'utf8');
    expect(table).toContain('getTerminal357CompletionReceipt(canonicalTerminal357IdentityRef.current)');
    expect(table).toContain('onThreeFiveSevenWinAnimationComplete?.(completion)');
    const sweep = table.slice(table.indexOf('// SURGICAL REPAIR — sweep celebration release.'),
      table.indexOf('// DEALER-GAME BOUNDARY: last-concrete-identity contract.'));
    expect(sweep).toContain('getTerminal357SweepCompletionReceipt(');
    expect(sweep).not.toContain('handNumber: null');
    expect(sweep).not.toContain('terminalGenerationId: null');
  });
});
