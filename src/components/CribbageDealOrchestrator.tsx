/**
 * CribbageDealOrchestrator — Wave 1 substrate proof for ONE DEAL.
 *
 *   handContextId changes
 *     ↓
 *   beginDeal(N)
 *     ↓
 *   dispatch N intents:
 *     from = dealer seat
 *     to   = round-robin starting at seat clockwise of dealer
 *     face = 'visible' iff recipient === self, else 'hidden'
 *     stagger = idx * 40ms
 *     duration = 110ms
 *     ↓
 *   each settle → settledCardIds
 *     ↓
 *   when settledCardIds.size === N: DealRuntime flips DEALING → READY
 *
 * Source authority: `{ kind: 'seat', position: dealerPosition }`.
 * cardEndpoints falls back to `[data-chip-center="${pos}"]` so no new
 * dealer-button anchor is required for Wave 1. The orchestrator only
 * publishes ONE new anchor — `[data-card-anchor="hand-${selfPlayerId}"]`
 * — for cards arriving in the local player's hand.
 *
 * Re-dispatch guard: the parent mounts this with `key={handContextId}`,
 * so a new hand naturally remounts and the useEffect runs once.
 */

import { useEffect, useRef } from 'react';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';

interface SeatEntry {
  playerId: string;
  position: number;
}

export interface CribbageDealOrchestratorProps {
  handContextId: string;
  dealerPlayerId: string;
  selfPlayerId: string;
  seats: SeatEntry[];
  /** Total cards to deal in this Wave 1 substrate proof. Default 6. */
  dealCount?: number;
}

export function CribbageDealOrchestrator({
  handContextId,
  dealerPlayerId,
  selfPlayerId,
  seats,
  dealCount = 6,
}: CribbageDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dispatchedRef = useRef(false);

  useEffect(() => {
    if (!deal || dispatchedRef.current) return;
    if (!seats.length) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    if (!dealerSeat) return;

    // Round-robin recipients starting clockwise of dealer (real Cribbage
    // pone-first order). seats are not assumed sorted; sort by position.
    const sorted = [...seats].sort((a, b) => a.position - b.position);
    const dealerIdx = sorted.findIndex(s => s.playerId === dealerPlayerId);
    if (dealerIdx < 0) return;

    const recipients: SeatEntry[] = [];
    for (let i = 1; i <= dealCount; i++) {
      recipients.push(sorted[(dealerIdx + i) % sorted.length]);
    }

    const inspect = isCardTransportInspectMode();
    // Inspect mode: absurdly slow — 800ms stagger, 600ms travel.
    // Normal mode: 40ms stagger, 110ms travel.
    const staggerMs  = inspect ? 800 : 40;
    const durationMs = inspect ? 600 : 110;

    const intents: CardTransportIntent[] = recipients.map((r, idx) => {
      const isSelf = r.playerId === selfPlayerId;
      return {
        id: `${handContextId}#card-${idx}`,
        cardId: `${handContextId}#card-${idx}`,
        face: isSelf ? 'visible' : 'hidden',
        from: { kind: 'seat', position: dealerSeat.position },
        to: isSelf
          ? { kind: 'hand', playerId: selfPlayerId }
          : { kind: 'seat', position: r.position },
        durationMs,
        launchDelayMs: idx * staggerMs,
        handContextId,
      };
    });

    dispatchedRef.current = true;
    deal.beginDeal(intents.length);
    ct.dispatchMany(intents);
    // eslint-disable-next-line no-console
    if (typeof window !== 'undefined' && (window as unknown as { __DEAL_DEBUG?: boolean }).__DEAL_DEBUG) {
      console.log('[cribbage-deal] dispatched', {
        handContextId,
        dealerPlayerId: dealerPlayerId.slice(0, 8),
        selfPlayerId: selfPlayerId.slice(0, 8),
        dealerPosition: dealerSeat.position,
        count: intents.length,
        recipients: recipients.map(r => r.playerId.slice(0, 8)),
      });
    }
  }, [deal, ct, handContextId, dealerPlayerId, selfPlayerId, seats, dealCount]);

  // Publish the local-hand anchor for `{ kind: 'hand', playerId: selfPlayerId }`.
  // Positioned at the bottom-center of the nearest positioned ancestor —
  // the shell's children flex column — which matches where Cribbage
  // mounts the player's hand row.
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '8%',
        width: 1,
        height: 1,
        transform: 'translate(-50%, 0)',
        pointerEvents: 'none',
      }}
      data-card-anchor={`hand-${selfPlayerId}`}
    />
  );
}
