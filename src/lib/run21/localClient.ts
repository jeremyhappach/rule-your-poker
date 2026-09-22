import { supabase } from '@/integrations/supabase/client';
import type { Projection } from './model';
import type { VisibleEvent } from './history';
import type { ReplayPackageV1 } from '../replay/contractV1';

export interface Run21Snapshot { revision: number; serverAt: number; view: Projection; balances: Record<string, number>; finished: boolean; events?: VisibleEvent[]; eventSequence?: number; requestId?: string }
export interface Run21HistoryRecord {dealerGameId: string; balances: Record<string, number>; events: VisibleEvent[]; replay: ReplayPackageV1 | null}
export async function run21Fetch(gameId: string, path: string, options: RequestInit = {}) {
  const {data} = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to reconnect to Run21.');
  return fetch(`/__run21/${gameId}/${path}`, {...options, headers: {...options.headers,
    Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json'}});
}
export async function run21Request<T>(gameId: string, path: string, body?: unknown): Promise<T> {
  const response = await run21Fetch(gameId, path, body === undefined ? {} : {method: 'POST', body: JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Run21 connection failed.');
  return result;
}
/** Reject regression and equal-revision disagreement; the server alone advances state. */
export function acceptRun21Snapshot(prior: Run21Snapshot | null, incoming: Run21Snapshot, dealerGameId: string) {
  if (incoming.view.identity.dealerGameId !== dealerGameId) return prior;
  if (!prior) return incoming;
  if (incoming.revision < prior.revision) return prior;
  if (incoming.revision === prior.revision && JSON.stringify([incoming.view, incoming.balances]) !== JSON.stringify([prior.view, prior.balances]))
    throw new Error('Run21 received conflicting state; reconnect required.');
  return incoming;
}
