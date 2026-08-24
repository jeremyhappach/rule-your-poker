export interface SerializedAuthoritativeFetch<Source> {
  setRunner: (runner: (source: Source) => Promise<boolean>) => void;
  request: (source: Source) => Promise<boolean>;
}

/**
 * Runs at most one authoritative snapshot at a time and coalesces a burst of
 * triggers to the newest pending source. Every caller joins the active drain,
 * so a reconnect cannot supersede a valid cold load merely by starting later.
 */
export function createSerializedAuthoritativeFetch<Source>(): SerializedAuthoritativeFetch<Source> {
  let runner: ((source: Source) => Promise<boolean>) | null = null;
  let pendingSource: Source | null = null;
  let activeDrain: Promise<boolean> | null = null;

  return {
    setRunner(nextRunner) {
      runner = nextRunner;
    },
    request(source) {
      pendingSource = source;
      if (activeDrain) return activeDrain;

      const drain = (async () => {
        let lastSucceeded = false;
        while (pendingSource !== null) {
          const nextSource = pendingSource;
          pendingSource = null;
          if (!runner) throw new Error('authoritative-fetch-runner-missing');
          lastSucceeded = await runner(nextSource);
        }
        return lastSucceeded;
      })();
      const trackedDrain = drain.finally(() => {
        if (activeDrain === trackedDrain) activeDrain = null;
      });
      activeDrain = trackedDrain;
      return trackedDrain;
    },
  };
}
