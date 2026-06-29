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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot, useDealTimingHydrated } from '@/lib/geometryLab/dealTimingStore';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';
import type { GinRummyCard } from '@/lib/ginRummyTypes';
import { recordGinRunbackTrace } from '@/lib/ginRunbackTrace';

interface SeatEntry {
  playerId: string;
  position: number;
}

// ── Module-level opening-deal ownership registry ──
// Canonical contract: ONE opening-deal manifest per full identity tuple
// (encoded into handContextId = "<dealerGameId>#r<roundId>#h<handNumber>").
// The orchestrator may unmount/remount many times within the same tuple
// (e.g. presentation reset, viewState briefly clearing). Instance-local
// dispatch refs are not safe — they reset on remount. This module-level
// Set survives orchestrator instance lifetime, so a remount under the
// same tuple observes the prior dispatch and skips beginDeal+dispatchMany.
const dispatchedOpeningDealManifests = new Set<string>();

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
    // Identity-bound opening-deal ownership: a remount under the same
    // handContextId (full 3-axis identity tuple) must observe the prior
    // dispatch and skip. This guards against orchestrator instance churn
    // re-running beginDeal/dispatchMany for the same hand.
    if (dispatchedOpeningDealManifests.has(handContextId)) {
      dispatchedRef.current = true;
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        payloadPhase: 'deal_orchestrator',
        skippedReason: 'identity-bound manifest already dispatched (remount under same tuple)',
      });
      return;
    }
    if (!dealTimingHydrated) {
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        payloadPhase: 'deal_orchestrator',
        skippedReason: 'deal timing not hydrated',
      });
      return;
    }
    if (!seats.length || cardsPerPlayer <= 0) {
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        payloadPhase: 'deal_orchestrator',
        skippedReason: 'missing seats/cardsPerPlayer',
      });
      return;
    }
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    const nonDealerSeat = seats.find(s => s.playerId === nonDealerPlayerId);
    if (!dealerSeat || !nonDealerSeat) {
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        skippedReason: 'missing dealer/nonDealer seat',
      });
      return;
    }
    if (!selfHand || selfHand.length < cardsPerPlayer) {
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        skippedReason: 'self hand below cardsPerPlayer',
      });
      return;
    }
    if (!discardTop) {
      recordGinRunbackTrace('DealRuntime dispatch skipped', {
        dealRuntime: { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size },
        selfHandCount: selfHand?.length ?? null,
        skippedReason: 'missing discardTop',
      });
      return;
    }

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
    // When local viewer is dealer, EVERY flight launches from canonical
    // bottom-center felt deal origin. Recipient determines destination only.
    const dealerOrigin: CardTransportIntent['from'] = dealerIsSelf
      ? { kind: 'feltDealOrigin' }
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
    recordGinRunbackTrace('DealRuntime dispatch', {
      dealRuntime: {
        handContextId,
        phase: deal.phase,
        expectedCount: intents.length,
        settledCount: deal.settledCardIds.size,
        dealerPlayerId,
        nonDealerPlayerId,
        selfPlayerId,
      },
      selfHandCount: selfHand.length,
      opponentHandCount: cardsPerPlayer,
      payloadPhase: 'deal_orchestrator',
    });
    deal.beginDeal(intents.length);
    ct.dispatchMany(intents);
  }, [
    deal, ct, handContextId, dealerPlayerId, nonDealerPlayerId, selfPlayerId,
    seats, cardsPerPlayer, selfHand, discardTop, cardBackColors, dealTimingHydrated,
  ]);

  // Canonical 1×1 anchor portaled into the Gin-owned active-player pane
  // (`[data-gin-active-pane-content]`). Anchor is layout-inert and sits
  // near the TOP of the pane so dropped cards land at top-of-fan.
  const [selfHandRegion, setSelfHandRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.querySelector('[data-gin-active-pane-content]') as HTMLElement | null;
    const initial = find();
    setSelfHandRegion(initial);
    recordGinRunbackTrace('active-pane readiness', {
      dealRuntime: deal ? { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size } : { handContextId, phase: null },
      activePaneAnchorHostPresent: !!initial,
      selfHandCount: selfHand?.length ?? null,
    });
    const observer = new MutationObserver(() => {
      const next = find();
      setSelfHandRegion(prev => {
        if (prev === next) return prev;
        recordGinRunbackTrace('active-pane readiness', {
          dealRuntime: deal ? { handContextId, phase: deal.phase, expectedCount: deal.expectedCount, settledCount: deal.settledCardIds.size } : { handContextId, phase: null },
          activePaneAnchorHostPresent: !!next,
          selfHandCount: selfHand?.length ?? null,
        });
        return next;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
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
      data-canonical-self-hand-anchor-position="gin-active-pane-top"
      data-anchor-owner="GinRummyDealOrchestrator.selfHandRegion"
    />
  );
  return selfHandRegion ? createPortal(anchorEl, selfHandRegion) : null;
}
