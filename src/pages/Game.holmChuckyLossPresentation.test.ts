import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const lossDispatchSection = source.slice(
  source.indexOf('// Check if this is a Holm Chucky loss'),
  source.indexOf('// Wait 4 seconds to show every other result'),
);

describe('Game Holm Chucky-loss presentation ownership', () => {
  it('dispatches one stable database-identity trigger across effect re-entry', () => {
    expect(lossDispatchSection).toContain('buildHolmChuckyLossSettlementKey');
    expect(lossDispatchSection).toContain('holmChuckyLossSettlementKeyRef.current === settlementKey');
    expect(lossDispatchSection).toContain('setChuckyLossTriggerId(`chucky-loss-${settlementKey}`)');
    expect(lossDispatchSection).not.toContain('setChuckyLossTriggerId(`chucky-loss-${Date.now()}`)');
  });

  it('keeps every recognized Chucky loss out of the generic auto-proceed timer', () => {
    expect(lossDispatchSection).toContain('isHolmChuckyLossResult(lastResult)');
    expect(lossDispatchSection).toContain('return;');
  });

  it('continues only from the canonical batch-settled callback during live presentation', () => {
    expect(source).toContain(
      'onChuckyLossEnded={isInProgress ? handleHolmChuckyLossPresentationComplete : undefined}',
    );
    expect(source).toContain("'presentation-settled'");
  });
});
