export class PerfSession {
  private readonly startMs = performance.now();
  private readonly stepsMs: Record<string, number> = {};

  constructor(
    private readonly label: string,
    private readonly warnAfterMs: number = 300,
  ) {}

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.stepsMs[name] = performance.now() - t0;
    }
  }

  done(extra?: Record<string, unknown>) {
    const totalMs = performance.now() - this.startMs;
    if (totalMs < this.warnAfterMs) return;

    const roundedSteps: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.stepsMs)) {
      roundedSteps[k] = Math.round(v);
    }

    // eslint-disable-next-line no-console
    console.warn(`[PERF] ${this.label} ${Math.round(totalMs)}ms`, {
      stepsMs: roundedSteps,
      ...(extra ?? {}),
    });
  }
}
