// Non-production model of pg_cron 1.6.4's interval admission and one bounded
// runner. This does not replace an installed-cron integration/failure test.
export class IntervalJob {
  active = true;
  running = false;
  pending = 0;
  lastStart = -Infinity;
  launches = 0;

  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
  }

  poll(now, capacity = true) {
    if (this.active && this.pending === 0 && now - this.lastStart >= this.intervalMs) {
      this.pending = 1;
    }
    if (this.active && !this.running && this.pending > 0 && capacity) {
      this.pending--;
      this.running = true;
      this.lastStart = now;
      this.launches++;
      return true;
    }
    return false;
  }

  finish() {
    this.running = false; // Completion/error retains the single pending run.
  }
}

export function delayAfterTick(startMs, finishedMs, periodMs = 1000) {
  return Math.max(0, periodMs - (finishedMs - startMs));
}

export function batchTimeline(workDurations) {
  let now = 0;
  return workDurations.map((workMs) => {
    const start = now;
    const commit = start + workMs;
    const sleep = delayAfterTick(start, commit);
    now = commit + sleep;
    return { start, commit, sleep, nextStart: now };
  });
}
