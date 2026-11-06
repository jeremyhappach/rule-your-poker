import type { CribbageState } from '@/lib/cribbageTypes';

export interface CountingFrame {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  pauseVersion: number;
  paused: boolean;
  pausedAt?: string | null;
  state: CribbageState;
}

export interface CountingTime {
  frame: CountingFrame;
  current: (overdueMs?: number) => boolean;
  elapsed: (state: CribbageState) => number;
  releaseDelay: (deadlineMs: number) => number;
}

export function activeCountingElapsed(serverMs: number, state: CribbageState, pauseVersion: number) {
  const start = Date.parse(state.countingStartedAt ?? '');
  const resolution = state.countingResolution;
  const original = Date.parse(resolution?.originalReleaseAt ?? '');
  const release = Date.parse(resolution?.presentationReleaseAt ?? '');
  // Older hands have no evidence of how many of the session's pauses occurred during counting.
  if (!Number.isFinite(start) || (pauseVersion !== 0 && !(release >= original))) return 0;
  const pausedMs = release >= original ? release - original : 0;
  return Math.max(0, serverMs - start - pausedMs);
}

// An accepted session frame supplies both time and the public counting projection.
// Ordinary reads refine the sample without replacing the mounted hand's presentation.
export function createCountingClock(refresh: () => void) {
  const listeners = new Set<() => void>();
  let generation = 0;
  let time: CountingTime | null = null;
  let sample: { server: number; sent: number; received: number; wall: number } | null = null;
  let requestSequence = 0;
  let latestSequence = 0;
  const notify = () => listeners.forEach(listener => listener());
  const invalidate = () => {
    generation++;
    latestSequence = 0;
    sample = null;
    if (time) { time = null; notify(); }
  };
  const available = () => !document.hidden && navigator.onLine;
  return {
    invalidate,
    observeLifecycle() {
      const restore = () => { if (!time && available()) refresh(); };
      const visibility = () => { if (document.hidden) invalidate(); else restore(); };
      const pageShow = (event: PageTransitionEvent) => { if (event.persisted) invalidate(); restore(); };
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('freeze', invalidate);
      document.addEventListener('resume', restore);
      window.addEventListener('pagehide', invalidate);
      window.addEventListener('pageshow', pageShow);
      window.addEventListener('offline', invalidate);
      window.addEventListener('online', restore);
      window.addEventListener('focus', restore);
      return () => {
        invalidate();
        document.removeEventListener('visibilitychange', visibility);
        document.removeEventListener('freeze', invalidate);
        document.removeEventListener('resume', restore);
        window.removeEventListener('pagehide', invalidate);
        window.removeEventListener('pageshow', pageShow);
        window.removeEventListener('offline', invalidate);
        window.removeEventListener('online', restore);
        window.removeEventListener('focus', restore);
      };
    },
    reconcile() { if (!time && available()) refresh(); },
    getSnapshot: () => time,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    request: () => ({ generation, sequence: ++requestSequence, sent: performance.now(), wall: Date.now() }),
    accept(request: { generation: number; sequence: number; sent: number; wall: number }, received: number, serverNow: string, frame: CountingFrame) {
      const server = Date.parse(serverNow);
      if (!available() || request.generation !== generation || request.sequence <= latestSequence || !Number.isFinite(server)) return;
      latestSequence = request.sequence;
      const wall = Date.now();
      // Wall time is only a discontinuity detector; it never advances a beat or deadline.
      if (Math.abs(wall - request.wall - (performance.now() - request.sent)) > 1000) {
        invalidate(); refresh(); return;
      }
      if (sample && Math.abs(wall - sample.wall - (performance.now() - sample.received)) > 1000) {
        // A new, valid reply can also be the first observation after suspension.
        invalidate();
        latestSequence = request.sequence;
      }
      const previous = time?.frame;
      const same = previous && previous.gameId === frame.gameId && previous.dealerGameId === frame.dealerGameId
        && previous.roundId === frame.roundId && previous.handNumber === frame.handNumber && previous.pauseVersion === frame.pauseVersion && previous.paused === frame.paused;
      if (!same || !sample || received - request.sent <= sample.received - sample.sent) {
        sample = { server, sent: request.sent, received, wall: wall - (performance.now() - received) };
      }
      if (same && time) { time.frame = frame; return; }
      const owner: CountingTime = {
        frame,
        current(overdueMs = 0) {
          if (time !== owner || !sample || owner.frame.paused) return false;
          if (!available()) { invalidate(); return false; }
          const delta = performance.now() - sample.received;
          if (overdueMs > 2000 || Math.abs(Date.now() - sample.wall - delta) > 1000) {
            invalidate(); refresh(); return false;
          }
          return true;
        },
        elapsed(state) {
          if (time !== owner || !sample) return 0;
          if (owner.frame.paused) {
            const stopped = Date.parse(owner.frame.pausedAt ?? '');
            return Number.isFinite(stopped) ? activeCountingElapsed(stopped, state, frame.pauseVersion) : 0;
          }
          const uncertainty = (sample.received - sample.sent) / 2;
          // A very slow response cannot reliably locate even the initial 500 ms beat.
          const localAnchor = uncertainty >= 500 ? sample.received : sample.received - uncertainty;
          return activeCountingElapsed(sample.server + performance.now() - localAnchor, state, frame.pauseVersion);
        },
        releaseDelay(deadlineMs) {
          if (time !== owner || !sample) return Infinity;
          // The server sampled after send and before receipt. Its time at receipt is at
          // least server_now, even when almost the entire round trip is on the return leg.
          return Math.max(0, deadlineMs - (sample.server + performance.now() - sample.received)) + 25;
        },
      };
      time = owner;
      notify();
    },
  };
}

export type CribbageCountingClock = ReturnType<typeof createCountingClock>;
