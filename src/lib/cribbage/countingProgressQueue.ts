export type CribbageCountingProgress = {
  roundId: string;
  targetIndex: number;
  beatIndex: number;
};

type CountingProgressQueueOptions = {
  write: (progress: CribbageCountingProgress) => Promise<void>;
  onError?: (error: unknown, progress: CribbageCountingProgress) => void;
};

function compareProgress(
  left: CribbageCountingProgress,
  right: CribbageCountingProgress,
): number {
  if (left.targetIndex !== right.targetIndex) {
    return left.targetIndex - right.targetIndex;
  }
  return left.beatIndex - right.beatIndex;
}

/**
 * Coalesces presentation-only counting cursors. At most one RPC may be in
 * flight per mounted table; while it runs, only the newest cursor for the
 * active round is retained. PostgreSQL remains the monotonic cursor owner.
 */
export function createCribbageCountingProgressQueue(
  options: CountingProgressQueueOptions,
): { enqueue: (progress: CribbageCountingProgress) => void } {
  const latestQueuedByRound = new Map<string, CribbageCountingProgress>();
  let pending: CribbageCountingProgress | null = null;
  let inFlight = false;

  const drain = async (): Promise<void> => {
    if (inFlight || !pending) return;
    const next = pending;
    pending = null;
    inFlight = true;
    try {
      await options.write(next);
    } catch (error) {
      options.onError?.(error, next);
    } finally {
      inFlight = false;
      if (pending) void drain();
    }
  };

  return {
    enqueue(progress) {
      const latest = latestQueuedByRound.get(progress.roundId);
      if (latest && compareProgress(progress, latest) <= 0) return;
      latestQueuedByRound.set(progress.roundId, progress);

      if (!pending || pending.roundId !== progress.roundId || compareProgress(progress, pending) > 0) {
        pending = progress;
      }
      void drain();
    },
  };
}
