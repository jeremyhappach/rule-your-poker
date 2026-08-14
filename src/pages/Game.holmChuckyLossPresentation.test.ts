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

  it('holds only local presentation while PostgreSQL owns successor release', () => {
    expect(source).toContain('latchHolmPresentationBarrier({');
    expect(source).toContain('Buffered authoritative successor behind local predecessor');
    expect(source).toContain('reconcileHolmPresentationBarrierFromEvidence(');
    expect(source).toContain('holmPresentationCompletionEvidenceRef.current.set(evidenceKey, completion)');
    expect(source).toContain('holmLiveRoundIdsObservedRef.current.add(handKey)');
    expect(source).not.toContain('holmLiveRoundIdsObservedRef.current.add(currentRound.id)');
    expect(source).toContain('? holmView.lastRoundResult');
    expect(source).toContain("? (holmView.roundStatus === 'completed' && !!holmView.lastRoundResult)");
    expect(source).toContain(
      'onChuckyLossEnded={isInProgress ? handleHolmChuckyLossPresentationComplete : undefined}',
    );
    expect(source).toContain(
      'onHolmContinuationPresentationComplete={isInProgress ? handleHolmContinuationPresentationComplete : undefined}',
    );
    expect(source).not.toContain('prepareNextHolmRound(');
    expect(source).not.toContain('activatePreparedHolmRound(');
    expect(source).not.toContain('proceedToNextHolmRound(');
  });
});
