export function createAuthoritativeRecoveryScheduler(refresh: () => Promise<unknown>) {
  const reasons = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let running = false;
  const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const schedule = (immediate = false) => {
    clear();
    if (!active || running || reasons.size === 0) return;
    timer = setTimeout(async () => {
      timer = null;
      running = true;
      try { await refresh(); }
      catch (error) { console.warn('[RECOVERY] Authoritative catch-up failed', error); }
      finally { running = false; schedule(); }
    }, immediate ? 0 : Math.min(...reasons.values()));
  };
  return {
    setActive(value: boolean) { active = value; schedule(); },
    setReason(key: string, needed: boolean, intervalMs = 3000) {
      const prior = reasons.get(key);
      if (needed && prior === intervalMs || !needed && prior === undefined) return;
      const wasEmpty = reasons.size === 0;
      if (needed) reasons.set(key, intervalMs); else reasons.delete(key);
      schedule(wasEmpty && needed);
    },
  };
}
