import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const terminalDetector = source.slice(
  source.indexOf('// Detect 3-5-7 final leg win and trigger win animation'),
  source.indexOf('// Identity-bound winner-hand resolver.'),
);
const tableSource = readFileSync(join(__dirname, '..', 'components', 'MobileGameTable.tsx'), 'utf8');
const ordinaryLegDetector = tableSource.slice(
  tableSource.indexOf('// Detect when a player earns a leg (3-5-7 games only)'),
  tableSource.indexOf('// Clear winning leg player when game status changes'),
);

describe('Game 3-5-7 decision reveal terminal admission', () => {
  it('does not admit the final-leg award until the reveal tableau has expired', () => {
    const ritualGate = terminalDetector.indexOf(
      'if (is357GameType && threeFiveSevenDecisionRevealBlocksResult) return;',
    );
    const processedResult = terminalDetector.indexOf(
      'threeFiveSevenWinProcessedRef.current = processedKey;',
    );
    const terminalTrigger = terminalDetector.indexOf('setThreeFiveSevenWinTriggerId(_357trigger);');

    expect(ritualGate).toBeGreaterThan(-1);
    expect(processedResult).toBeGreaterThan(ritualGate);
    expect(terminalTrigger).toBeGreaterThan(processedResult);
    expect(terminalDetector).toContain('threeFiveSevenDecisionRevealBlocksResult]);');
  });

  it('defers ordinary leg awards without consuming their pending player-leg delta', () => {
    const ritualGate = ordinaryLegDetector.indexOf(
      'if (__is357GameType(gameType) && threeFiveSevenDecisionRevealBlocksResult) {',
    );
    const awardLoop = ordinaryLegDetector.indexOf('players.forEach((player) => {');

    expect(ritualGate).toBeGreaterThan(-1);
    expect(awardLoop).toBeGreaterThan(ritualGate);
    expect(ordinaryLegDetector).toContain(
      'threeFiveSevenDecisionRevealBlocksResult]);',
    );
  });
});
