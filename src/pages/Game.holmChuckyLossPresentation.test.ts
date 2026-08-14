import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const holmDispatchSection = source.slice(
  source.indexOf('// Check if this is a pussy tax scenario'),
  source.indexOf('// Wait 4 seconds to show every non-Holm result'),
);

describe('Game Holm Chucky-loss presentation ownership', () => {
  it('dispatches one stable hand-plan trigger across effect re-entry', () => {
    expect(holmDispatchSection).toContain('getHolmPresentationHandKey(holmPresentationIdentity!)');
    expect(holmDispatchSection).toContain('holmChuckyLossPresentationPlanKeyRef.current === presentationPlanKey');
    expect(holmDispatchSection).toContain('setChuckyLossTriggerId(`chucky-loss-${presentationPlanKey}`)');
    expect(holmDispatchSection).not.toContain('setChuckyLossTriggerId(`chucky-loss-${Date.now()}`)');
  });

  it('keeps one multi-batch showdown plan while exact cursor evidence remains separate', () => {
    expect(holmDispatchSection).toContain('holmShowdownPresentationPlanKeyRef.current === presentationPlanKey');
    expect(holmDispatchSection).toContain('setHolmShowdownTriggerId(`holm-showdown-${presentationPlanKey}`)');
    expect(holmDispatchSection).not.toContain('buildHolmShowdownPresentationKey');
    expect(holmDispatchSection).not.toContain('setHolmShowdownTriggerId(`holm-showdown-${Date.now()}`)');
    expect(source).toContain('getHolmPresentationIdentityKey(completion)');
  });

  it('latches Pussy Tax on its hand plan rather than its mutable transfer cursor', () => {
    expect(holmDispatchSection).toContain('holmPussyTaxPresentationPlanKeyRef.current !== pussyTaxPresentationPlanKey');
    expect(holmDispatchSection).toContain('const pussyTaxTriggerKey = `pussy-tax-${pussyTaxPresentationPlanKey}`');
    expect(holmDispatchSection).not.toContain('cursor-${holmPresentationIdentity.transferCursor}');
  });

  it('keeps every Holm result out of the generic auto-proceed timer', () => {
    expect(holmDispatchSection).toContain("game?.game_type === 'holm-game'");
    expect(holmDispatchSection).toContain('Waiting for exact Holm presentation acknowledgement');
    expect(holmDispatchSection).toContain('return;');
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
