import { describe, expect, it } from 'vitest';
import { assertDecidingLegProgress } from './threeFiveSevenPresentationDriver';

const rounds = [
  { hand_number: 1, round_number: 1, round_id: '00000000-0000-4000-8000-000000000001' },
  { hand_number: 1, round_number: 2, round_id: '00000000-0000-4000-8000-000000000002' },
  { hand_number: 1, round_number: 3, round_id: '00000000-0000-4000-8000-000000000003' },
  { hand_number: 2, round_number: 1, round_id: '00000000-0000-4000-8000-000000000004' },
  { hand_number: 2, round_number: 2, round_id: '00000000-0000-4000-8000-000000000005' },
];

describe('deciding-leg driver progression', () => {
  it('accepts the legal five-leg sequence across the hand rollover', () => {
    const completed = new Set<string>();
    for (const [index, identity] of rounds.entries()) {
      expect(() => assertDecidingLegProgress(identity, index, completed)).not.toThrow();
      completed.add(identity.round_id);
    }
  });

  it.each([
    ['repeated round 1', 1, { ...rounds[1], round_number: 1 }],
    ['skipped round 2', 1, { ...rounds[1], round_number: 3 }],
    ['early new hand', 2, { ...rounds[2], hand_number: 2 }],
    ['missing hand rollover', 3, { ...rounds[3], hand_number: 1 }],
    ['duplicate round UUID', 1, { ...rounds[1], round_id: rounds[0].round_id }],
    ['missing round UUID', 1, { ...rounds[1], round_id: null }],
  ] as const)('rejects %s before another decision', (_label, index, identity) => {
    expect(() => assertDecidingLegProgress(identity, index, new Set([rounds[0].round_id])))
      .toThrow('Unexpected deciding-leg progression');
  });
});
