// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');

describe('normal 3-5-7 Sweep the Legs presentation wiring', () => {
  it('starts the overlay with leg flights and carries early completion into the credit gate', () => {
    const handler = source.slice(
      source.indexOf('const handleLegsToPlayerComplete'),
      source.indexOf('// A reconciled cursor is every bit as authoritative'),
    );
    expect(handler).toContain(
      'createTerminal357NormalSweepGate(descriptor.terminalGenerationId)',
    );
    expect(handler).toContain("setThreeFiveSevenWinPhase('sweep-credit')");
    expect(source).toContain("show={showSweepTheLegs357 || threeFiveSevenWinPhase === 'legs-to-player'}");
    expect(handler).toContain('normalSweepOverlayCompletedRef.current === descriptor.terminalGenerationId');
  });

  it('routes normal overlay completion through the two-receipt release gate', () => {
    expect(source).toContain("'terminal_sweep_credit_and_overlay_complete'");
    expect(source).toContain('completePending357LegSweepOverlay();');
    expect(source).toContain('isTerminal357NormalSweepGateReady(pending.completionGate)');
  });
});
