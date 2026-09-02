import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CribbageMobileGameTable.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Could not find ${start}`);
  return source.slice(startIndex, endIndex);
}

describe('Cribbage lifecycle recovery wiring', () => {
  it('keeps a valid discard choice when the first hydrated round id arrives', () => {
    const selection = between(
      'const [cribbageDiscardSelection, setCribbageDiscardSelection]',
      '// ── Latched pegboard data',
    );

    expect(selection).toContain('const previousRoundId = prevCribbageDiscardRoundIdRef.current;');
    expect(selection).toContain('if (previousRoundId && previousRoundId !== roundId)');
    expect(selection).not.toContain('prevCribbageDiscardRoundIdRef.current !== roundId');
  });

  it('hands an exact terminal counting state to the existing win sequence', () => {
    const terminalHandoff = between(
      '// A terminal counting state can arrive from the authoritative handoff',
      '// CRITICAL: When currentRoundId changes',
    );

    expect(terminalHandoff).toContain('terminalState.phase !== \'complete\'');
    expect(terminalHandoff).toContain('!terminalState.lastHandCount');
    expect(terminalHandoff).toContain('countedIdentity.roundId !== currentRoundId');
    expect(terminalHandoff).toContain('countedIdentity.handNumber !== currentHandNumber');
    expect(terminalHandoff).toContain("requestCribbageSettlement('authoritative-counting-terminal-handoff')");
    expect(terminalHandoff).toContain('triggerWinSequence(terminalState);');
    expect(terminalHandoff).not.toContain('setTimeout(');
  });
});
