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
