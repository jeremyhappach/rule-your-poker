import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const terminalDetector = source.slice(
  source.indexOf('// Detect 3-5-7 final leg win and trigger win animation'),
  source.indexOf('// Identity-bound winner-hand resolver.'),
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
});
