/**
 * CribbageDealOrchestrator — Wave 1 substrate proof for ONE DEAL.
 *
 * Round-robin starting at seat clockwise of dealer, repeated until
 * every player has cardsPerPlayer cards. Total intents:
 *
 *   expectedCount = cardsPerPlayer × seats.length
 *
 * (matches CARDS_PER_PLAYER[playerCount] in cribbageGameLogic.)
 *
 * Self-recipient intents stamp `visibleFace` from the authoritative
 * `selfHand` so the in-flight asset is a real canonical face card
 * (rank + suit) instead of a plain white rectangle. Dispatch waits
 * until `selfHand.length >= cardsPerPlayer` so the visible faces are
 * deterministic.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTiming } from '@/lib/geometryLab/dealTimingStore';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';
import type { CribbageCard } from '@/lib/cribbageTypes';

interface SeatEntry {
  playerId: string;
  position: number;
}

export interface CribbageDealOrchestratorProps {
  handContextId: string;
  dealerPlayerId: string;
  selfPlayerId: string;
  seats: SeatEntry[];
  /** Cards each player must visibly receive. From CARDS_PER_PLAYER. */
  cardsPerPlayer: number;
  /** Authoritative local hand. Required to stamp visibleFace. */
  selfHand: CribbageCard[];
}

export function CribbageDealOrchestrator({
  handContextId,
  dealerPlayerId,
  selfPlayerId,
  seats,
  cardsPerPlayer,
  selfHand,
}: CribbageDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dispatchedRef = useRef(false);
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  useEffect(() => {
    if (!deal || dispatchedRef.current) return;
    if (!seats.length || cardsPerPlayer <= 0) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    if (!dealerSeat) return;
    // Wait for authoritative self hand so visible faces are real cards.
    if (!selfHand || selfHand.length < cardsPerPlayer) return;

    const sorted = [...seats].sort((a, b) => a.position - b.position);
    const dealerIdx = sorted.findIndex(s => s.playerId === dealerPlayerId);
    if (dealerIdx < 0) return;

    const inspect = isCardTransportInspectMode();
    const staggerMs  = inspect ? 800 : 40;
    const durationMs = inspect ? 600 : 110;

    const totalCount = cardsPerPlayer * sorted.length;
    const intents: CardTransportIntent[] = [];
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let off = 1; off <= sorted.length; off++) {
        const r = sorted[(dealerIdx + off) % sorted.length];
        const idx = intents.length;
        const isSelf = r.playerId === selfPlayerId;
        // ONE TRANSPORT, ONE CARDBACK — all flights render the canonical
        // cardback. The reveal moment is arrival, when the destination
        // (opponent stack or self hand) claims ownership of the real card.
        intents.push({
          id: `${handContextId}#card-${idx}`,
          cardId: `${handContextId}#card-${idx}`,
          face: 'hidden',
          from: { kind: 'seat', position: dealerSeat.position },
          to: isSelf
            ? { kind: 'hand', playerId: selfPlayerId }
            : { kind: 'seat', position: r.position },
          durationMs,
          launchDelayMs: idx * staggerMs,
          handContextId,
          recipientPlayerId: r.playerId,
          cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
        });
      }
    }

    dispatchedRef.current = true;
    deal.beginDeal(totalCount);
    ct.dispatchMany(intents);
    if (typeof window !== 'undefined' && (window as unknown as { __DEAL_DEBUG?: boolean }).__DEAL_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[cribbage-deal] dispatched', {
        handContextId,
        dealerPlayerId: dealerPlayerId.slice(0, 8),
        selfPlayerId: selfPlayerId.slice(0, 8),
        dealerPosition: dealerSeat.position,
        cardsPerPlayer,
        totalCount,
        intentCount: intents.length,
      });
    }
  }, [deal, ct, handContextId, dealerPlayerId, selfPlayerId, seats, cardsPerPlayer, selfHand, cardBackColors]);

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
