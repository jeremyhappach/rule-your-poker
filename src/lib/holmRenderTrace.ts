/**
 * Holm final-render-boundary persistence.
 *
 * Persists four event types to debug_sync_events:
 *   holm-normal-seat-render-final   — normal-seat path rendered cards for an opponent
 *   holm-solo-area-render-final     — solo-area path rendered cards
 *   holm-dual-render-detected       — BOTH paths active for the same player simultaneously
 *   holm-normal-seat-render-blocked — normal-seat would have rendered but was suppressed
 *
 * Sampling rule: only persists on fingerprint change per (handContextId, renderPath, playerId).
 * Fingerprint = cardIds + key gating booleans.
 */

import { supabase } from '@/integrations/supabase/client';
import { isSyncDebugEnabled } from './persistSyncDebugEvent';

// ── Fingerprint dedup ─────────────────────────────────────────

const lastFingerprints = new Map<string, string>();

function shouldPersist(key: string, fingerprint: string): boolean {
  const prev = lastFingerprints.get(key);
  if (prev === fingerprint) return false;
  lastFingerprints.set(key, fingerprint);
  return true;
}

/** Clear fingerprints on hand boundary change */
export function resetHolmRenderTrace(handContextId?: string): void {
  if (!handContextId) {
    lastFingerprints.clear();
    return;
  }
  // Clear entries not matching current hand
  for (const k of lastFingerprints.keys()) {
    if (!k.startsWith(handContextId)) lastFingerprints.delete(k);
  }
}

// ── Shared payload type ───────────────────────────────────────

export interface HolmRenderPayload {
  clientId: string;
  gameId: string;
  roundId?: string;
  handNumber: number;
  handContextId: string;
  renderedPlayerId: string;
  cardIds: string;
  cardSource: string;
  // gating booleans
  isShowdown: boolean;
  shouldHideForTabling: boolean;
  isHolmWinWinner: boolean;
  isSoloVsChuckyPlayer: boolean;
  isSoloVsChuckyPlayerRaw: boolean;
  isSoloVsChucky: boolean;
  soloVsChuckyPlayerIdLocked: string | null;
  soloVsChuckyTableLocked: boolean;
  showdownModeLocked: boolean;
  stayedPlayersCount: number;
  playerDecision: string | null;
  decisionLocked: boolean | null;
  playerExplicitlyStayed: boolean;
  apparentIsActivePlayer: boolean;
  isSoloVsChuckyRaw: boolean;
}

// ── Fire-and-forget writer ────────────────────────────────────

function persist(
  gameId: string,
  handNumber: number,
  roundId: string | undefined,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  supabase
    .from('debug_sync_events' as any)
    .insert({
      game_id: gameId,
      game_type: 'holm-game',
      hand_number: handNumber,
      round_id: roundId ?? null,
      event_type: 'invariant',
      severity: eventName === 'holm-dual-render-detected' ? 'error' : 'info',
      event_name: eventName,
      payload,
    } as any)
    .then(({ error }: { error: any }) => {
      if (error) console.warn(`[holm-render-trace] ${eventName} write failed:`, error.message);
    });
}

// ── Public API ────────────────────────────────────────────────

/**
 * Called when normal-seat render path IS active for an opponent.
 * Also detects dual-render if solo-area would render the same player.
 */
export function traceNormalSeatRender(p: HolmRenderPayload, renderType: 'face-up' | 'card-backs'): void {
  if (!isSyncDebugEnabled()) return;

  const fpBools = `${p.isShowdown}|${p.shouldHideForTabling}|${p.isSoloVsChucky}|${p.soloVsChuckyPlayerIdLocked}|${p.stayedPlayersCount}|${p.showdownModeLocked}`;
  const fingerprint = `${renderType}|${p.cardIds}|${fpBools}`;
  const dedupKey = `${p.handContextId}:normal:${p.renderedPlayerId}`;

  if (!shouldPersist(dedupKey, fingerprint)) return;

  const payload: Record<string, unknown> = {
    ...p,
    renderType,
    renderPath: 'normal-seat',
  };

  persist(p.gameId, p.handNumber, p.roundId, 'holm-normal-seat-render-final', payload);

  // Dual-render detection: is solo-area also active for same player?
  if (p.isSoloVsChucky) {
    persist(p.gameId, p.handNumber, p.roundId, 'holm-dual-render-detected', {
      ...payload,
      dualRenderNote: 'normal-seat rendered while isSoloVsChucky is true for same player',
    });
  }
}

/**
 * Called when solo-area render path fires.
 */
export function traceSoloAreaRender(p: HolmRenderPayload): void {
  if (!isSyncDebugEnabled()) return;

  const fpBools = `${p.isSoloVsChucky}|${p.soloVsChuckyPlayerIdLocked}|${p.stayedPlayersCount}|${p.showdownModeLocked}|${p.isSoloVsChuckyRaw}`;
  const fingerprint = `${p.cardIds}|${fpBools}`;
  const dedupKey = `${p.handContextId}:solo:${p.renderedPlayerId}`;

  if (!shouldPersist(dedupKey, fingerprint)) return;

  persist(p.gameId, p.handNumber, p.roundId, 'holm-solo-area-render-final', {
    ...p,
    renderPath: 'solo-area',
    cardSource: p.cardSource,
  });
}

/**
 * Called when normal-seat path WOULD have rendered but was suppressed by shouldHideForTabling.
 */
export function traceNormalSeatBlocked(p: HolmRenderPayload, blockReason: string): void {
  if (!isSyncDebugEnabled()) return;

  const fpBools = `${p.isShowdown}|${p.shouldHideForTabling}|${p.isSoloVsChucky}|${p.soloVsChuckyPlayerIdLocked}|${p.stayedPlayersCount}`;
  const fingerprint = `blocked|${p.cardIds}|${fpBools}`;
  const dedupKey = `${p.handContextId}:blocked:${p.renderedPlayerId}`;

  if (!shouldPersist(dedupKey, fingerprint)) return;

  persist(p.gameId, p.handNumber, p.roundId, 'holm-normal-seat-render-blocked', {
    ...p,
    renderPath: 'normal-seat-blocked',
    blockReason,
  });
}
