import { describe, expect, it } from 'vitest';

import {
  getCountingResumeAnnouncement,
  getCountingResumeCursorFromElapsed,
  shouldPresentPeggingEventAfterHydration,
  type CountingTimelineBeat,
} from './countingResume';

const beats: CountingTimelineBeat[] = [
  { type: 'enter', targetIndex: 0, comboIndex: -1, durationMs: 800 },
  { type: 'initial', targetIndex: 0, comboIndex: -1, durationMs: 500 },
  { type: 'combo', targetIndex: 0, comboIndex: 0, durationMs: 2_000 },
  { type: 'total', targetIndex: 0, comboIndex: -1, durationMs: 1_500 },
  { type: 'exit', targetIndex: 0, comboIndex: -1, durationMs: 1_500 },
  { type: 'enter', targetIndex: 1, comboIndex: -1, durationMs: 800 },
  { type: 'zero', targetIndex: 1, comboIndex: -1, durationMs: 1_000 },
  { type: 'exit', targetIndex: 1, comboIndex: -1, durationMs: 1_500 },
  { type: 'complete', targetIndex: 1, comboIndex: -1, durationMs: 1_000 },
];

describe('getCountingResumeCursorFromElapsed', () => {
  it('does not invent a cursor before counting begins', () => {
    expect(getCountingResumeCursorFromElapsed(beats, -1)).toBeNull();
  });

  it('joins a live combo instead of replaying the hand from the start', () => {
    expect(getCountingResumeCursorFromElapsed(beats, 1_300)).toEqual({
      targetIndex: 0,
      beatIndex: 0,
      phase: 'scoring',
      complete: false,
    });
  });

  it('resumes the total/exit boundary without replaying completed combos', () => {
    expect(getCountingResumeCursorFromElapsed(beats, 3_300)).toEqual({
      targetIndex: 0,
      beatIndex: 1,
      phase: 'scoring',
      complete: false,
    });
  });

  it('keeps a zero-point target at its current target', () => {
    expect(getCountingResumeCursorFromElapsed(beats, 7_150)).toEqual({
      targetIndex: 1,
      beatIndex: -1,
      phase: 'scoring',
      complete: false,
    });
  });

  it('marks a fully elapsed sequence complete', () => {
    expect(getCountingResumeCursorFromElapsed(beats, 10_600)).toEqual({
      targetIndex: 1,
      beatIndex: -1,
      phase: 'scoring',
      complete: true,
    });
  });
});

describe('counting rejoin announcement ownership', () => {
  const targets = [
    {
      label: "Pone's Hand",
      combos: [
        { label: 'Fifteen', points: 2 },
        { label: 'Pair', points: 2 },
      ],
    },
  ];

  it('restores the active combo text from the persisted cursor', () => {
    expect(getCountingResumeAnnouncement(targets, 0, 1)).toEqual({
      targetLabel: "Pone's Hand",
      text: 'Pair: +2',
    });
  });

  it('does not invent a combo announcement for entering or total beats', () => {
    expect(getCountingResumeAnnouncement(targets, 0, -1)).toBeNull();
    expect(getCountingResumeAnnouncement(targets, 0, 2)).toBeNull();
  });

  it('does not revive a persisted final-pegging event on a counting rejoin', () => {
    expect(shouldPresentPeggingEventAfterHydration({
      phase: 'counting',
      eventType: 'go_point',
      hasObservedPeggingForHand: false,
    })).toBe(false);
  });

  it('preserves final pegging presentation for a client that witnessed pegging', () => {
    expect(shouldPresentPeggingEventAfterHydration({
      phase: 'counting',
      eventType: 'go_point',
      hasObservedPeggingForHand: true,
    })).toBe(true);
  });

  it('keeps His Heels independent of the pegging admission latch', () => {
    expect(shouldPresentPeggingEventAfterHydration({
      phase: 'complete',
      eventType: 'his_heels',
      hasObservedPeggingForHand: false,
    })).toBe(true);
  });
});
