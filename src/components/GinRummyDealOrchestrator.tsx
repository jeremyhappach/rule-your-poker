/**
 * GinRummyDealOrchestrator — Wave 2 canonical deal for Gin Rummy.
 *
 * Mirrors CribbageDealOrchestrator. Emits the natural Gin deal order:
 *
 *   for round 0..9 (CARDS_PER_PLAYER):
 *     dealer → non-dealer  (opp-stack or self hand)
 *     dealer → dealer      (opp-stack or self hand)
 *   → 20 hidden intents (CanonicalCardBack)
 *   dealer → stock                     (hidden ownership claim)
 *   dealer → discard                   (visible upcard, visibleFace stamped)
 *
 *   expectedCount = 22
 *
 * Self-recipient intents stamp `visibleFace` from authoritative
 * `selfHand` so the in-flight asset is the real face card. The discard
 * intent stamps `visibleFace` from the authoritative `discardTop`.
 *
 * Dispatch waits until `selfHand.length >= CARDS_PER_PLAYER` AND
 * `discardTop` is present so every stamped face is deterministic.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot, useDealTimingHydrated } from '@/lib/geometryLab/dealTimingStore';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';
import type { GinRummyCard } from '@/lib/ginRummyTypes';

interface SeatEntry {
  playerId: string;
  position: number;
}

const SYMBOL_TO_WORD: Record<string, 'hearts' | 'diamonds' | 'clubs' | 'spades'> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
  spades: 'spades', hearts: 'hearts', diamonds: 'diamonds', clubs: 'clubs',
} as Record<string, 'hearts' | 'diamonds' | 'clubs' | 'spades'>;

function toVisibleFace(card: GinRummyCard): { rank: string; suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' } {
  return { rank: card.rank, suit: SYMBOL_TO_WORD[card.suit] ?? 'spades' };
}

export interface GinRummyDealOrchestratorProps {
  handContextId: string;
  dealerPlayerId: string;
  nonDealerPlayerId: string;
  selfPlayerId: string;
  seats: SeatEntry[];          // both seated players
  cardsPerPlayer: number;      // CARDS_PER_PLAYER (10 for Gin)
  selfHand: GinRummyCard[];    // authoritative self hand
  discardTop: GinRummyCard | null; // authoritative first upcard
}

export function GinRummyDealOrchestrator({
  handContextId,
  dealerPlayerId,
  nonDealerPlayerId,
  selfPlayerId,
  seats,
  cardsPerPlayer,
  selfHand,
  discardTop,
}: GinRummyDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dispatchedRef = useRef(false);
  const dealTimingHydrated = useDealTimingHydrated();
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  useEffect(() => {
    if (!deal || dispatchedRef.current) return;
    if (!dealTimingHydrated) return;
    if (!seats.length || cardsPerPlayer <= 0) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    const nonDealerSeat = seats.find(s => s.playerId === nonDealerPlayerId);
    if (!dealerSeat || !nonDealerSeat) return;
    if (!selfHand || selfHand.length < cardsPerPlayer) return;
    if (!discardTop) return;

    const emitTime = performance.now();
    const inspect = isCardTransportInspectMode();
    const timing = getDealTimingSnapshot();
    const intentTimingSource: 'GeometryLab' | 'inspectionMode' = inspect ? 'inspectionMode' : 'GeometryLab';
    const staggerMs  = inspect ? 800 : timing.launchSpacingMs;
    const durationMs = inspect ? 600 : timing.durationMs;
    const launchDelayFormula = inspect
      ? 'idx * inspectionMode.launchSpacingMs(800)'
      : `idx * DealTimingStore.launchSpacingMs(${timing.launchSpacingMs}) @v${timing.storeVersion}`;

    const dealerIsSelf = dealerPlayerId === selfPlayerId;
    const dealerOrigin: CardTransportIntent['from'] = dealerIsSelf
      ? { kind: 'hand', playerId: selfPlayerId }
      : { kind: 'seat', position: dealerSeat.position };

    // Recipient order per round: non-dealer first, then dealer.
    const order: SeatEntry[] = [nonDealerSeat, dealerSeat];
    const intents: CardTransportIntent[] = [];

    const pushIntent = (
      cardId: string,
      to: CardTransportIntent['to'],
      face: CardTransportIntent['face'],
      recipientPlayerId: string | undefined,
      visibleFace: CardTransportIntent['visibleFace'] | undefined,
      idx: number,
    ) => {
      const launchDelayMs = idx * staggerMs;
      intents.push({
        id: cardId,
        cardId,
        face,
        from: dealerOrigin,
        to,
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
        recipientPlayerId,
        cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
        visibleFace,
      });
    };

    // ── 20 hidden intents to the seats (10 per player, non-dealer first)
    let selfRound = 0;
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (const r of order) {
        const idx = intents.length;
        const isSelf = r.playerId === selfPlayerId;
        const cardId = `${handContextId}#card-${idx}`;
        const visibleFace = isSelf && selfHand[selfRound]
          ? toVisibleFace(selfHand[selfRound])
          : undefined;
        if (isSelf) selfRound++;
        pushIntent(
          cardId,
          isSelf
            ? { kind: 'hand', playerId: selfPlayerId }
            : { kind: 'oppStack', position: r.position },
          // face stays hidden during flight; destination claims on arrival
          'hidden',
          r.playerId,
          visibleFace,
          idx,
        );
      }
    }

    // ── stock ownership claim (hidden CanonicalCardBack)
    pushIntent(
      `${handContextId}#stock`,
      { kind: 'stock' },
      'hidden',
      undefined,
      undefined,
      intents.length,
    );

    // ── discard upcard (visible, stamped from authoritative discardTop)
    pushIntent(
      `${handContextId}#discard`,
      { kind: 'discard' },
      'visible',
      undefined,
      toVisibleFace(discardTop),
      intents.length,
    );

    dispatchedRef.current = true;
    deal.beginDeal(intents.length);
    ct.dispatchMany(intents);
  }, [
    deal, ct, handContextId, dealerPlayerId, nonDealerPlayerId, selfPlayerId,
    seats, cardsPerPlayer, selfHand, discardTop, cardBackColors, dealTimingHydrated,
  ]);

  // Canonical 1×1 anchor for hand-${selfPlayerId} — origin/terminus for
  // self-recipient intents. Matches CribbageDealOrchestrator footprint.
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
