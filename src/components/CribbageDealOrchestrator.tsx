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
 *     stagger = inspect 800ms / normal 40ms
 *     duration = inspect 600ms / normal 110ms
 *     recipientPlayerId stamped so DealRuntime can clip per-player
 *       destination visibility one card at a time.
 *     cardBackColors threaded from useVisualPreferences so the in-flight
 *       hidden cardback matches the canonical Cribbage cardback styling.
 *     ↓
 *   each settle → settledCardIds (+ per-recipient counter)
 *     ↓
 *   when settledCardIds.size === N: DealRuntime flips DEALING → READY
 *
 * Source authority: `{ kind: 'seat', position: dealerPosition }`.
 *
 * Local-hand anchor is positioned at the very bottom of the felt
 * container so dealer→self has a visible drop, not "appear/disappear
 * on top of the dealer button."
 */

import { useEffect, useMemo, useRef } from 'react';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
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
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  useEffect(() => {
    if (!deal || dispatchedRef.current) return;
    if (!seats.length) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    if (!dealerSeat) return;

    const sorted = [...seats].sort((a, b) => a.position - b.position);
    const dealerIdx = sorted.findIndex(s => s.playerId === dealerPlayerId);
    if (dealerIdx < 0) return;

    const recipients: SeatEntry[] = [];
    for (let i = 1; i <= dealCount; i++) {
      recipients.push(sorted[(dealerIdx + i) % sorted.length]);
    }

    const inspect = isCardTransportInspectMode();
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
        recipientPlayerId: r.playerId,
        cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
      };
    });

    dispatchedRef.current = true;
    deal.beginDeal(intents.length);
    ct.dispatchMany(intents);
    if (typeof window !== 'undefined' && (window as unknown as { __DEAL_DEBUG?: boolean }).__DEAL_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[cribbage-deal] dispatched', {
        handContextId,
        dealerPlayerId: dealerPlayerId.slice(0, 8),
        selfPlayerId: selfPlayerId.slice(0, 8),
        dealerPosition: dealerSeat.position,
        count: intents.length,
        recipients: recipients.map(r => r.playerId.slice(0, 8)),
      });
    }
  }, [deal, ct, handContextId, dealerPlayerId, selfPlayerId, seats, dealCount, cardBackColors]);

  // Publish the local-hand anchor at the bottom of the felt container.
  // Sitting at `bottom: 0` (the felt's south rail) gives dealer→self a
  // visible vertical drop from the dealer-button chip area down toward
  // the player's hand region, instead of collapsing on top of itself.
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        width: 1,
        height: 1,
        transform: 'translate(-50%, 0)',
        pointerEvents: 'none',
      }}
      data-card-anchor={`hand-${selfPlayerId}`}
    />
  );
}
