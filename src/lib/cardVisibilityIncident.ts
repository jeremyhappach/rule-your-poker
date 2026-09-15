import { supabase } from '@/integrations/supabase/client';
import { buildMetaPayload } from './buildMeta';
import { getClientId } from './clientContext';
import type { CardVisibilitySample } from './cardVisibilityMonitor';
import { getCardVisibilityBoundaries } from './cardVisibilityMonitor';

export const CARD_INCIDENT_KEY = 'ptp:card-visibility-incidents:v1';
const TTL = 24 * 60 * 60 * 1000;
interface Pending { id: string; created: number; attempts: number; lastAttempt: number; sample: CardVisibilitySample; preceding: CardVisibilitySample[]; build: Record<string, string>; clientId: string; boundaries?: ReturnType<typeof getCardVisibilityBoundaries> }
let sending = false;
let delayedRetry: ReturnType<typeof setTimeout> | undefined;
const read = (): Pending[] => {
  try {
    const parsed: Pending[] = JSON.parse(localStorage.getItem(CARD_INCIDENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(p => p?.sample?.contract && typeof p.id === 'string' && Date.now() - p.created < TTL).slice(0, 8) : [];
  } catch { return []; }
};
const write = (items: Pending[]) => { try { localStorage.setItem(CARD_INCIDENT_KEY, JSON.stringify(items)); } catch { /* Diagnostics cannot interrupt gameplay. */ } };

export function retainCardVisibilityIncident(sample: CardVisibilitySample, preceding: CardVisibilitySample[]): void {
  try {
    const seenKey = `${CARD_INCIDENT_KEY}:seen`;
    const seen: Array<{ key: string; at: number }> = JSON.parse(localStorage.getItem(seenKey) ?? '[]');
    const key = [sample.contract.gameId, sample.contract.handContextId, sample.contract.roundNumber,
      sample.contract.viewerId, ...sample.failures].join(':');
    if (seen.some(item => item.key === key && Date.now() - item.at < TTL)) return;
    const items = read();
    if (items.length >= 8 || items.some(p => p.sample.contract.handContextId === sample.contract.handContextId
      && p.sample.contract.viewerId === sample.contract.viewerId && p.sample.failures.join() === sample.failures.join())) return;
    write([...items, { id: crypto.randomUUID(), created: Date.now(), attempts: 0, lastAttempt: 0,
      sample, preceding: preceding.slice(-12), build: buildMetaPayload(), clientId: getClientId(), boundaries: getCardVisibilityBoundaries(sample.contract.gameId) }]);
    localStorage.setItem(seenKey, JSON.stringify([...seen.filter(item => Date.now() - item.at < TTL), { key, at: Date.now() }].slice(-64)));
    void flushCardVisibilityIncidents();
  } catch { /* Storage and UUID availability are not gameplay dependencies. */ }
}

export async function flushCardVisibilityIncidents(): Promise<void> {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    const { data } = await supabase.auth.getSession();
    const viewer = data.session?.user.id;
    if (!viewer) return;
    const eligible = read().filter(p => p.sample.contract.viewerId === viewer && p.attempts < 5);
    const pending = eligible.filter(p => Date.now() - p.lastAttempt >= 30_000).slice(0, 2);
    if (!pending.length && eligible.length && delayedRetry === undefined) {
      // One deferred wake for a reconnect inside the cooldown; a failed send does not reschedule itself.
      const delay = Math.max(1, Math.min(...eligible.map(p => p.lastAttempt + 30_000 - Date.now())));
      delayedRetry = setTimeout(() => { delayedRetry = undefined; void flushCardVisibilityIncidents(); }, delay);
    }
    for (const item of pending) {
      item.attempts++; item.lastAttempt = Date.now();
      write(read().map(p => p.id === item.id ? item : p));
      const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 5_000);
      try {
        const { gameId, roundId } = item.sample.contract;
        const { error } = await supabase.from('debug_events').upsert({
          id: item.id, game_id: gameId, round_id: roundId, user_id: viewer,
          client_role: 'card-visibility-monitor', event_type: 'card-visibility-invariant',
          payload: JSON.parse(JSON.stringify({ version: 1, diagnosticKind: 'invariant',
            detectedAt: new Date(item.created).toISOString(), clientId: item.clientId, ...item.build,
            sample: item.sample, preceding: item.preceding, boundaries: item.boundaries ?? [] })),
        }, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(abort.signal);
        if (!error) write(read().filter(p => p.id !== item.id));
      } catch { /* Keep the frozen capsule for a bounded lifecycle-triggered retry. */ }
      finally { clearTimeout(timeout); }
    }
  } catch { /* Auth/storage/network diagnostics are nonblocking. */ }
  finally { sending = false; }
}

export function resumeCardVisibilityDelivery(): () => void {
  const resume = () => { if (document.visibilityState === 'visible') void flushCardVisibilityIncidents(); };
  window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
  void flushCardVisibilityIncidents();
  return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
}
