import {subscribeAuthoritativeRecoverySnapshot} from './realtimeAuthoritativeCatchup';

export interface AuthoritativeSubscriptionOptions<T> {
  subscribe: (changed: () => void, status: (connected: boolean) => void) => () => void;
  load: () => Promise<T>;
  apply: (value: T, recovering: boolean) => boolean;
  connected: (ready: boolean) => void;
  error: (error: unknown) => void;
  interrupt: () => void;
  recoverPending?: () => Promise<unknown>;
  isPaused?: () => boolean;
}

/** A socket ACK is not readiness. Every new channel needs a post-ACK snapshot.
 * Owns only reads/subscription recovery; never advances a game or its clock.
 */
export function createAuthoritativeSubscription<T>(options: AuthoritativeSubscriptionOptions<T>) {
  let ready = false;
  let recovering = false;
  let disposed = false, generation = 0, subscribed = false, rebind = false, retries = 0;
  let stop = () => {}, ackTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const newLane = () => ({ running: null as Promise<boolean> | null, dirty: false, ack: 0 });
  let lane = newLane();
  const available = () => !document.hidden && navigator.onLine;
  const publishReady = (value: boolean) => { ready = value; options.connected(value); };
  const blocked = () => { recovering = true; publishReady(false); options.interrupt(); };
  const retire = () => {
    generation++; ready = false; subscribed = false; clearTimeout(ackTimer); clearTimeout(retryTimer); ackTimer = retryTimer = undefined;
    stop(); stop = () => {}; lane = newLane();
  };
  const retry = (replace: boolean) => {
    if (disposed) return;
    blocked();
    if (replace) { retire(); rebind = true; }
    if (!available() || retries >= 2 || retryTimer) return;
    retries++;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (disposed || !available()) return;
      if (rebind) open(); else void refresh();
    }, 1000);
  };
  function refresh(): Promise<boolean> {
    if (disposed || !available()) return Promise.resolve(false);
    const current = lane, token = generation;
    current.dirty = true;
    if (current.running) return current.running;
    current.running = read();
    return current.running;
    async function read() {
    let success = false;
    try {
      while (current.dirty && !disposed && token === generation && available()) {
        current.dirty = false;
        const ack = current.ack;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const value = await Promise.race([
          Promise.resolve().then(options.load),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Snapshot recovery timed out')), 10000); }),
        ]).finally(() => clearTimeout(timeout));
        if (disposed || token !== generation || !available()) return false;
        if (!options.apply(value, recovering)) throw new Error('Snapshot recovery returned stale state');
        success = true;
        // An ACK arriving during the read queues a second read. Only that
        // post-ACK request can close the fetch/subscribe blind window.
        if (subscribed && ack > 0 && ack === current.ack && !current.dirty) {
          retries = 0; recovering = false; publishReady(true);
        }
      }
    } catch (error) {
      success = false;
      if (!disposed && token === generation) { options.error(error); retry(false); }
    } finally { current.running = null; }
    return success;
    }
  }
  function open(initial = false) {
    retire(); rebind = false;
    if (disposed) return;
    if (!initial) blocked();
    const token = generation;
    ackTimer = setTimeout(() => { ackTimer = undefined; if (!disposed && token === generation && !subscribed) retry(true); }, 5000);
    const unsubscribe = options.subscribe(
      () => { if (!disposed && token === generation) void refresh(); },
      online => {
        if (disposed || token !== generation) return;
        if (!online) { retry(true); return; }
        clearTimeout(ackTimer); ackTimer = undefined;
        subscribed = true; lane.ack++; void refresh();
        if (options.recoverPending) void options.recoverPending().catch(options.error);
      },
    );
    // Some deterministic transports report failure synchronously in subscribe.
    if (disposed || token !== generation) unsubscribe(); else stop = unsubscribe;
    void refresh();
  }
  async function recover(block = false): Promise<boolean> {
    if (disposed) return false;
    recovering = true;
    options.interrupt();
    if (block || !subscribed || rebind) blocked();
    if (!available()) { rebind = true; return false; }
    retries = 0; clearTimeout(retryTimer); retryTimer = undefined;
    if (!subscribed || rebind) { open(); return false; }
    const token = generation;
    // An uncertain command must not prevent channel/snapshot recovery. Its
    // immutable pending UUID continues to gate actions in the adapter.
    const refreshed = refresh();
    await options.recoverPending?.();
    if (disposed || token !== generation) return false;
    await refreshed;
    return refresh();
  }
  const resume = () => { void recover(true).catch(options.error); };
  const interrupt = () => {
    if (!navigator.onLine) rebind = true;
    blocked();
  };
  const visibility = () => { if (document.hidden) interrupt(); else resume(); };
  window.addEventListener('focus', resume); window.addEventListener('online', resume);
  window.addEventListener('offline', interrupt); document.addEventListener('visibilitychange', visibility);
  const stopRecovery = subscribeAuthoritativeRecoverySnapshot(resume);
  // A missed resume can leave a healthy socket and a paused projection forever.
  // Read the existing authority while paused; this never advances game time.
  const pausedCheck = setInterval(() => {
    if (options.isPaused?.() && available()) void recover().catch(options.error);
  }, 5000);
  open(true);
  if (options.recoverPending) void options.recoverPending().catch(options.error);
  return {
    refresh, recover, isReady: () => ready && !disposed && available(),
    dispose() {
      disposed = true; retire();
      stopRecovery(); clearInterval(pausedCheck);
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume);
      window.removeEventListener('offline', interrupt); document.removeEventListener('visibilitychange', visibility);
    },
  };
}

/** Late replies must never retire a replacement intent stored under this scope. */
export function retireAcknowledgedCommand(key: string, expected: string | null) {
  if (expected !== null && sessionStorage.getItem(key) === expected) sessionStorage.removeItem(key);
}

/** Re-read a persisted boundary if its worker runs just after the first read.
 * Scope changes cancel these finite attempts. This is not a progression timer.
 */
export function scheduleAuthoritativeBoundary(delay: number, refresh: () => unknown) {
  if (!Number.isFinite(delay) || delay > 2147480000) return () => {};
  const timers = [0, 1000, 3000].map(grace => setTimeout(refresh, Math.max(0, delay) + grace));
  return () => timers.forEach(clearTimeout);
}
