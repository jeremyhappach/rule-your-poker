export type CountingTimelineBeatType =
  | 'enter'
  | 'initial'
  | 'combo'
  | 'zero'
  | 'total'
  | 'exit'
  | 'complete';

export interface CountingTimelineBeat {
  type: CountingTimelineBeatType;
  targetIndex: number;
  comboIndex: number;
  durationMs: number;
}

export interface CountingResumeCursor {
  targetIndex: number;
  beatIndex: number;
  phase: 'entering' | 'scoring';
  complete: boolean;
}

type CountingAnnouncementTarget = {
  label: string;
  combos: ReadonlyArray<{
    label: string;
    points: number;
  }>;
};

export interface CountingResumeAnnouncement {
  targetLabel: string;
  text: string;
}

/**
 * Returns the announcement that belongs to an already-active resumed combo.
 * A cursor at -1 is an enter/zero beat, and a cursor at `combos.length` is
 * the total beat, neither of which owns a combo announcement.
 */
export function getCountingResumeAnnouncement(
  targets: readonly CountingAnnouncementTarget[],
  targetIndex: number,
  comboIndex: number,
): CountingResumeAnnouncement | null {
  const target = targets[targetIndex];
  const combo = target?.combos[comboIndex];
  if (!combo) return null;

  return {
    targetLabel: target.label,
    text: `${combo.label}: +${combo.points}`,
  };
}

/**
 * A persisted pegging event is historical on a fresh counting mount. Keep it
 * presentable only for a client that witnessed this hand's pegging phase;
 * His Heels is a cut-card event and remains independently presentable.
 */
export function shouldPresentPeggingEventAfterHydration(input: {
  phase: string | null | undefined;
  eventType: string | null | undefined;
  hasObservedPeggingForHand: boolean;
}): boolean {
  if (input.eventType === 'his_heels') return true;
  return input.phase === 'pegging' || input.hasObservedPeggingForHand;
}

/**
 * Derives the closest resumable counting cursor from the database-owned start
 * anchor. This is only a bootstrap fallback while no persisted cursor has
 * advanced; persisted progress remains the preferred resume source.
 */
export function getCountingResumeCursorFromElapsed(
  beats: readonly CountingTimelineBeat[],
  elapsedMs: number,
): CountingResumeCursor | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || beats.length === 0) return null;

  let remainingMs = elapsedMs;
  const comboCountByTarget = new Map<number, number>();
  for (const beat of beats) {
    if (beat.type === 'combo') {
      comboCountByTarget.set(
        beat.targetIndex,
        Math.max(comboCountByTarget.get(beat.targetIndex) ?? 0, beat.comboIndex + 1),
      );
    }
  }

  for (const beat of beats) {
    if (remainingMs < beat.durationMs) {
      if (beat.type === 'complete') {
        return {
          targetIndex: beat.targetIndex,
          beatIndex: -1,
          phase: 'scoring',
          complete: true,
        };
      }

      const comboCount = comboCountByTarget.get(beat.targetIndex) ?? 0;
      const beatIndex = beat.type === 'combo'
        ? beat.comboIndex
        : (beat.type === 'total' || beat.type === 'exit') && comboCount > 0
          ? comboCount
          : -1;

      return {
        targetIndex: beat.targetIndex,
        beatIndex,
        phase: beat.type === 'enter' ? 'entering' : 'scoring',
        complete: false,
      };
    }
    remainingMs -= beat.durationMs;
  }

  const lastBeat = beats[beats.length - 1];
  return {
    targetIndex: lastBeat.targetIndex,
    beatIndex: -1,
    phase: 'scoring',
    complete: true,
  };
}
