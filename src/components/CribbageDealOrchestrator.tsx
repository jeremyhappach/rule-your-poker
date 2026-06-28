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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot, useDealTimingHydrated } from '@/lib/geometryLab/dealTimingStore';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { SLOT } from '@/lib/canonicalShell/seatAnchors';
import { getCanonicalSlotPlacement } from '@/lib/canonicalShell/canonicalSlotPlacement';
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
  const dealTimingHydrated = useDealTimingHydrated();
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);
  const dealerIsSelf = dealerPlayerId === selfPlayerId;
  const dealerSeatForOrigin = seats.find(s => s.playerId === dealerPlayerId) ?? null;
  const dealerPositionForOrigin = dealerSeatForOrigin?.position ?? null;
  const selfDealerFelt = useShellFeltFrameElement(dealerIsSelf);
  const selfDealerFeltIsSurface = !!selfDealerFelt?.hasAttribute('data-canonical-felt-surface');


  useEffect(() => {
    if (!deal || dispatchedRef.current) return;
    if (!dealTimingHydrated) return;
    if (!seats.length || cardsPerPlayer <= 0) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    if (!dealerSeat) return;
    // Wait for authoritative self hand so visible faces are real cards.
    if (!selfHand || selfHand.length < cardsPerPlayer) return;

    const sorted = [...seats].sort((a, b) => a.position - b.position);
    const dealerIdx = sorted.findIndex(s => s.playerId === dealerPlayerId);
    if (dealerIdx < 0) return;

    const emitTime = performance.now();
    const inspect = isCardTransportInspectMode();
    const timing = getDealTimingSnapshot();
    const intentTimingSource: 'GeometryLab' | 'inspectionMode' = inspect ? 'inspectionMode' : 'GeometryLab';
    const staggerMs  = inspect ? 800 : timing.launchSpacingMs;
    const durationMs = inspect ? 600 : timing.durationMs;
    const launchDelayFormula = inspect
      ? 'idx * inspectionMode.launchSpacingMs(800)'
      : `idx * DealTimingStore.launchSpacingMs(${timing.launchSpacingMs}) @v${timing.storeVersion}`;

    // eslint-disable-next-line no-console
    console.log('[GEOM STORE]', {
      source: timing.source,
      launchSpacingMs: timing.launchSpacingMs,
      durationMs: timing.durationMs,
      ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
      updatedAt: timing.updatedAt,
      dbUpdatedAt: timing.dbUpdatedAt,
      storeVersion: timing.storeVersion,
      hydrated: timing.hydrated,
      readAt: emitTime,
      handContextId,
    });

    // eslint-disable-next-line no-console
    console.log('[GEOM DEAL SETTINGS]', {
      source: intentTimingSource,
      launchSpacingMs: timing.launchSpacingMs,
      durationMs: timing.durationMs,
      ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
      effectiveStaggerMs: staggerMs,
      effectiveDurationMs: durationMs,
      inspectMode: inspect,
      handContextId,
      cardsPerPlayer,
      seats: sorted.length,
      expectedCards: cardsPerPlayer * sorted.length,
      emitTime,
      storeUpdatedAt: timing.updatedAt,
      storeVersion: timing.storeVersion,
      launchDelayFormula,
    });

    const totalCount = cardsPerPlayer * sorted.length;
    const dealerOrigin: CardTransportIntent['from'] = { kind: 'seat', position: dealerSeat.position };

    const intents: CardTransportIntent[] = [];
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let off = 1; off <= sorted.length; off++) {
        const r = sorted[(dealerIdx + off) % sorted.length];
        const idx = intents.length;
        const isSelf = r.playerId === selfPlayerId;
        const launchDelayMs = idx * staggerMs;
        // ONE TRANSPORT, ONE CARDBACK — all flights render the canonical
        // cardback. The reveal moment is arrival, when the destination
        // (opponent stack or self hand) claims ownership of the real card.
        intents.push({
          id: `${handContextId}#card-${idx}`,
          cardId: `${handContextId}#card-${idx}`,
          face: 'hidden',
          from: dealerOrigin,
          to: isSelf
            ? { kind: 'hand', playerId: selfPlayerId }
            : { kind: 'oppStack', position: r.position },
          durationMs,
          launchDelayMs,
          ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
          timingSource: intentTimingSource,
          dealTimingSettings: {
            launchSpacingMs: timing.launchSpacingMs,
            durationMs: timing.durationMs,
            ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
            effectiveLaunchSpacingMs: staggerMs,
            effectiveDurationMs: durationMs,
          },
          dealTimingStoreSnapshot: {
            launchSpacingMs: timing.launchSpacingMs,
            durationMs: timing.durationMs,
            ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
            updatedAt: timing.updatedAt,
            dbUpdatedAt: timing.dbUpdatedAt,
            storeVersion: timing.storeVersion,
            source: timing.source,
            hydrated: timing.hydrated,
          },
          intentTimingSource,
          launchDelayFormula,
          expectedStartTime: emitTime + launchDelayMs,
          expectedArrivalTime: emitTime + launchDelayMs + durationMs,
          handContextId,
          recipientPlayerId: r.playerId,
          cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
        });
      }
    }

    dispatchedRef.current = true;
    deal.beginDeal(totalCount);
    // eslint-disable-next-line no-console
    for (const it of intents) console.log('[INTENT STAMP]', {
      intentId: it.id,
      launchDelayMs: it.launchDelayMs,
      durationMs: it.durationMs,
      ownershipClaimDelayMs: it.ownershipClaimDelayMs,
      launchSpacing: it.dealTimingSettings?.effectiveLaunchSpacingMs,
      source: it.intentTimingSource,
      storeLaunchSpacingMs: it.dealTimingStoreSnapshot?.launchSpacingMs,
      storeDurationMs: it.dealTimingStoreSnapshot?.durationMs,
      storeOwnershipClaimDelayMs: it.dealTimingStoreSnapshot?.ownershipClaimDelayMs,
      storeUpdatedAt: it.dealTimingStoreSnapshot?.updatedAt,
      storeVersion: it.dealTimingStoreSnapshot?.storeVersion,
      launchDelayFormula: it.launchDelayFormula,
      expectedStartTime: emitTime + (it.launchDelayMs ?? 0),
      expectedArrivalTime: emitTime + (it.launchDelayMs ?? 0) + (it.durationMs ?? 0),
      handContextId,
    });
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
  }, [deal, ct, handContextId, dealerPlayerId, selfPlayerId, seats, cardsPerPlayer, selfHand, cardBackColors, dealTimingHydrated]);

  // Portal canonical hand anchor into the active-player pane, near
  // the TOP edge — cards land on top and fan grows downward.
  const [selfHandRegion, setSelfHandRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.querySelector('[data-357-active-hand-region]') as HTMLElement | null;
    setSelfHandRegion(el);
  }, [handContextId, selfPlayerId]);

  const anchorEl = (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '15%',
        width: 1,
        height: 1,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
      data-card-anchor={`hand-${selfPlayerId}`}
      data-canonical-self-hand-anchor-position="top-of-pane"
      data-anchor-owner="CribbageDealOrchestrator.selfHandRegion"
    />
  );
  return selfHandRegion ? createPortal(anchorEl, selfHandRegion) : anchorEl;
}
