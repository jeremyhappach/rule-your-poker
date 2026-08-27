import { describe, expect, it } from 'vitest';
import { isThreeFiveSevenDecisionSurfaceEnvelopeOpen } from './decisionSurfaceEnvelope';

const playable = {
  canDecide: true,
  activeTab: 'cards',
  isWaitingPhase: false,
  sessionEndedPhase: false,
  isDealerConfigPhase: false,
  hasCurrentPlayer: true,
  autoFold: false,
};

describe('3-5-7 decision surface envelope', () => {
  it('opens only when the whole committed presentation envelope is playable', () => {
    expect(isThreeFiveSevenDecisionSurfaceEnvelopeOpen(playable)).toBe(true);
  });

  it.each([
    ['chat tab', { activeTab: 'chat' }],
    ['waiting', { isWaitingPhase: true }],
    ['session ended', { sessionEndedPhase: true }],
    ['dealer setup', { isDealerConfigPhase: true }],
    ['missing player', { hasCurrentPlayer: false }],
    ['auto-fold', { autoFold: true }],
  ])('stays closed for %s', (_label, patch) => {
    expect(isThreeFiveSevenDecisionSurfaceEnvelopeOpen({ ...playable, ...patch })).toBe(false);
  });
});
