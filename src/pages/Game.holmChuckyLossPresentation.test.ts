import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const lossDispatchSection = source.slice(
  source.indexOf('// Check if this is a Holm Chucky loss'),
  source.indexOf('// Wait 4 seconds to show every non-Holm result'),
);

describe('Game Holm Chucky-loss presentation ownership', () => {
  it('dispatches one stable database-identity trigger across effect re-entry', () => {
    expect(lossDispatchSection).toContain('buildHolmChuckyLossSettlementKey');
    expect(lossDispatchSection).toContain('holmChuckyLossSettlementKeyRef.current === settlementKey');
    expect(lossDispatchSection).toContain('setChuckyLossTriggerId(`chucky-loss-${settlementKey}`)');
    expect(lossDispatchSection).not.toContain('setChuckyLossTriggerId(`chucky-loss-${Date.now()}`)');
  });

  it('keeps every Holm result out of the generic auto-proceed timer', () => {
    expect(lossDispatchSection).toContain("game?.game_type === 'holm-game'");
    expect(lossDispatchSection).toContain('Waiting for exact Holm presentation acknowledgement');
    expect(lossDispatchSection).toContain('return;');
  });

  it('prepares the successor before presentation and activates it after the canonical batch settles', () => {
    expect(source).toContain('prepareNextHolmRound(gameId, roundId)');
    expect(source).toContain('activatePreparedHolmRound(gameId, roundId, prepared.round_id!)');
    expect(source).toContain(
      'onChuckyLossEnded={isInProgress ? handleHolmChuckyLossPresentationComplete : undefined}',
    );
    expect(source).toContain(
      'onHolmContinuationPresentationComplete={isInProgress ? handleHolmContinuationPresentationComplete : undefined}',
    );
    expect(source).toContain("'presentation-settled'");
    expect(source).not.toContain("void proceedToNextHolmRound(gameId, roundId)\n      .catch");
  });
});
