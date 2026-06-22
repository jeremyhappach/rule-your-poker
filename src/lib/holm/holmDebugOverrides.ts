/**
 * Holm Admin Debug Overrides
 *
 * Persistent (localStorage) admin-only forced winner toggles for
 * Solo vs Chucky showdown. RESULT OVERRIDE ONLY — does not bypass
 * Chucky deal, visual reveal, announcement, or win-sequence.
 *
 * Mutually exclusive: enabling one auto-disables the other.
 */

const LS_PLAYER = 'ptp_holm_force_player_beats_chucky';
const LS_CHUCKY = 'ptp_holm_force_chucky_beats_player';

export type HolmForcedWinner = 'player' | 'chucky' | null;

function read(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}

function write(key: string, on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch { /* noop */ }
}

export function isForcePlayerBeatsChucky(): boolean { return read(LS_PLAYER); }
export function isForceChuckyBeatsPlayer(): boolean { return read(LS_CHUCKY); }

export function getHolmForcedWinner(): HolmForcedWinner {
  if (isForcePlayerBeatsChucky()) return 'player';
  if (isForceChuckyBeatsPlayer()) return 'chucky';
  return null;
}

export function setForcePlayerBeatsChucky(on: boolean): void {
  write(LS_PLAYER, on);
  if (on) write(LS_CHUCKY, false);
  emit();
}

export function setForceChuckyBeatsPlayer(on: boolean): void {
  write(LS_CHUCKY, on);
  if (on) write(LS_PLAYER, false);
  emit();
}

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeHolmDebugOverrides(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LS_PLAYER || e.key === LS_CHUCKY) emit();
  });
}
