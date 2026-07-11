/**
 * CribbageDealOrchestrator — Wave 1 substrate proof for ONE DEAL.
 *
 * Round-robin starting at seat clockwise of dealer, repeated until
 * every player has cardsPerPlayer cards. Total intents:
 *
 *   expectedCount = cardsPerPlayer × seats.length
 *
 * Transport ownership split (post-contained-repair):
 *   - Opponent recipients: from = dealer's canonical seat-cluster
 *     anchor (`[data-card-anchor="seat-${dealerPos}"]`, emitted by
 *     CanonicalSeatCluster). No Cribbage portal, no slot override.
 *   - Self recipients: from = to = `hand-${selfPlayerId}`. The flight
 *     resolves in place inside the Cribbage active-player pane, so
 *     local cards drop directly into the active-hand box and never
 *     traverse the felt.
 *
 * Self-hand anchor is portaled into the Cribbage-owned active pane
 * (`[data-cribbage-active-pane-content]`). The 3-5-7 active-hand
 * region is intentionally NOT consulted by Cribbage.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot } from '@/lib/geometryLab/dealTimingStore';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';
import type { CribbageCard } from '@/lib/cribbageTypes';
import { recordDealTransportDispatch } from '@/lib/cribbage/dealTransportLedger';
import { recordCribbageWartime } from '@/lib/cribbage/cribbageWartimeLedger';



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
  /** Optional ledger keys — fall back to handContextId / 0 when unknown. */
  dealerGameId?: string;
  roundId?: string;
  handNumber?: number;
  /** Temporary in-memory P0 truth-panel lifecycle feed. */
  onLifecycle?: (event: 'mounted' | 'unmounted' | 'beginDealCalled' | 'dispatchManyCalled') => void;
}

export function CribbageDealOrchestrator({
  handContextId,
  dealerPlayerId,
  selfPlayerId,
  seats,
  cardsPerPlayer,
  selfHand,
  dealerGameId,
  roundId,
  handNumber,
  onLifecycle,
}: CribbageDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dispatchedRef = useRef(false);
  // Hydration is intentionally NOT a dispatch gate. getDealTimingSnapshot()
  // returns defaults synchronously when hydration hasn't landed; late
  // hydration must not restart or mutate the active deal.
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  useEffect(() => {
    onLifecycle?.('mounted');
    recordCribbageWartime('deal', 'orchestrator_mount', {
      handContextId, dealerPlayerId, selfPlayerId, cardsPerPlayer,
      seatCount: seats.length, dealerGameId, roundId, handNumber,
    }, {
      producerComponent: 'CribbageDealOrchestrator',
      producerFunction: 'mount',
      dedupeKey: `mount:${handContextId}`,
    });
    return () => {
      onLifecycle?.('unmounted');
      recordCribbageWartime('deal', 'orchestrator_unmount', { handContextId }, {
        producerComponent: 'CribbageDealOrchestrator',
        producerFunction: 'unmount',
        dedupeKey: `unmount:${handContextId}`,
      });
    };
  }, [onLifecycle, handContextId, dealerPlayerId, selfPlayerId, cardsPerPlayer, seats.length, dealerGameId, roundId, handNumber]);



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

  useEffect(() => {
    // Prerequisites evaluation — always emitted (coalesced by dedupeKey).
    const dealerSeatEarly = seats.find(s => s.playerId === dealerPlayerId);
    const prereqPayload = {
      hasDeal: !!deal,
      alreadyDispatched: dispatchedRef.current,
      seatCount: seats.length,
      cardsPerPlayer,
      hasDealerSeat: !!dealerSeatEarly,
      selfHandLength: selfHand?.length ?? 0,
      selfHandSufficient: !!selfHand && selfHand.length >= cardsPerPlayer,
      handContextId,
    };
    const allOk = prereqPayload.hasDeal && !prereqPayload.alreadyDispatched &&
      prereqPayload.seatCount > 0 && prereqPayload.cardsPerPlayer > 0 &&
      prereqPayload.hasDealerSeat && prereqPayload.selfHandSufficient;
    recordCribbageWartime('deal', 'dispatch_prerequisites_evaluated', {
      ...prereqPayload, allOk,
    }, {
      producerComponent: 'CribbageDealOrchestrator',
      producerFunction: 'dispatchEffect.prereq',
      dedupeKey: `prereq:${handContextId}:${allOk}:${prereqPayload.selfHandLength}`,
      eventReason: allOk ? 'all prerequisites satisfied' : 'prerequisites not yet satisfied',
    });

    if (!deal || dispatchedRef.current) {
      if (dispatchedRef.current) {
        recordCribbageWartime('deal', 'duplicate_dispatch_suppressed', {
          handContextId, reason: 'dispatchedRef.current=true',
        }, {
          producerComponent: 'CribbageDealOrchestrator',
          producerFunction: 'dispatchEffect.guard',
          dedupeKey: `dup:${handContextId}`,
        });
      }
      return;
    }

    if (!seats.length || cardsPerPlayer <= 0) return;
    const dealerSeat = seats.find(s => s.playerId === dealerPlayerId);
    if (!dealerSeat) return;
    if (!selfHand || selfHand.length < cardsPerPlayer) return;

    const sorted = [...seats].sort((a, b) => a.position - b.position);
    const dealerIdx = sorted.findIndex(s => s.playerId === dealerPlayerId);
    if (dealerIdx < 0) return;

    recordCribbageWartime('deal', 'dispatch_attempt', {
      handContextId, dealerIdx, seatOrder: sorted.map(s => s.playerId),
      cardsPerPlayer, expectedIntentCount: cardsPerPlayer * sorted.length,
    }, {
      producerComponent: 'CribbageDealOrchestrator',
      producerFunction: 'dispatchEffect.begin',
      dedupeKey: `attempt:${handContextId}`,
    });

    const emitTime = performance.now();
    const inspect = isCardTransportInspectMode();
    const timing = getDealTimingSnapshot();
    const intentTimingSource: 'GeometryLab' | 'inspectionMode' = inspect ? 'inspectionMode' : 'GeometryLab';
    const staggerMs  = inspect ? 800 : timing.launchSpacingMs;
    const durationMs = inspect ? 600 : timing.durationMs;
    const launchDelayFormula = inspect
      ? 'idx * inspectionMode.launchSpacingMs(800)'
      : `idx * DealTimingStore.launchSpacingMs(${timing.launchSpacingMs}) @v${timing.storeVersion}`;

    recordCribbageWartime('deal', 'timing_snapshot_taken', {
      handContextId, inspect, staggerMs, durationMs,
      timingSource: intentTimingSource,
      hydrated: timing.hydrated, storeSource: timing.source, storeVersion: timing.storeVersion,
      launchSpacingMs: timing.launchSpacingMs, durationMsRaw: timing.durationMs,
      ownershipClaimDelayMs: timing.ownershipClaimDelayMs,
      updatedAt: timing.updatedAt, dbUpdatedAt: timing.dbUpdatedAt,
    }, {
      producerComponent: 'CribbageDealOrchestrator',
      producerFunction: 'dispatchEffect.timing',
      dedupeKey: `timing:${handContextId}`,
    });

    const totalCount = cardsPerPlayer * sorted.length;
    const dealerIsSelf = dealerPlayerId === selfPlayerId;

    // When the local viewer is the dealer, EVERY flight (self + opponent)
    // originates from the canonical bottom-center felt deal origin
    // ([data-card-anchor="felt-deal-origin"]). Recipient determines
    // destination only; it MUST NOT determine or override the source.
    // The anchor is static DOM inside the felt surface, so resolution
    // returns the same rect for every flight in this batch.
    const dealerOrigin: CardTransportIntent['from'] = dealerIsSelf
      ? { kind: 'feltDealOrigin' }
      : { kind: 'seat', position: dealerSeat.position };

    const intents: CardTransportIntent[] = [];
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let off = 1; off <= sorted.length; off++) {
        const r = sorted[(dealerIdx + off) % sorted.length];
        const idx = intents.length;
        const isSelf = r.playerId === selfPlayerId;
        const launchDelayMs = idx * staggerMs;
        const from: CardTransportIntent['from'] = dealerOrigin;
        const to: CardTransportIntent['to'] = isSelf
          ? { kind: 'hand', playerId: selfPlayerId }
          : { kind: 'oppStack', position: r.position };
        intents.push({
          id: `${handContextId}#card-${idx}`,
          cardId: `${handContextId}#card-${idx}`,
          face: 'hidden',
          from,
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
          recipientPlayerId: r.playerId,
          cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
        });
      }
    }

    dispatchedRef.current = true;
    deal.beginDeal(totalCount);
    onLifecycle?.('beginDealCalled');

    // Record each intent in the deal-transport idempotency ledger.
    // Record-only: does not suppress or repair. Callers inspect the
    // ledger via exportDealTransportLedgerJson().
    const ledgerDealerGameId = dealerGameId ?? handContextId;
    const ledgerRoundId = roundId ?? handContextId;
    const ledgerHandNumber = handNumber ?? 0;
    for (const intent of intents) {
      const destination =
        intent.to.kind === 'hand'
          ? `hand:${intent.to.playerId}`
          : intent.to.kind === 'oppStack'
          ? `oppStack:${intent.to.position}`
          : `other:${intent.to.kind}`;
      recordDealTransportDispatch({
        dealerGameId: ledgerDealerGameId,
        roundId: ledgerRoundId,
        handNumber: ledgerHandNumber,
        cardId: intent.cardId ?? intent.id,
        recipientPlayerId: intent.recipientPlayerId ?? '',
        destination,
        transportInstanceId: intent.id,
        source: 'CribbageDealOrchestrator',
        reason: 'initial-deal',
        origin: 'authoritative',
        precedingEvent: 'none',
      });
    }

    ct.dispatchMany(intents);
    onLifecycle?.('dispatchManyCalled');
  }, [deal, ct, handContextId, dealerPlayerId, selfPlayerId, seats, cardsPerPlayer, selfHand, cardBackColors, dealerGameId, roundId, handNumber, onLifecycle]);

  // Portal canonical hand anchor into the Cribbage-owned active pane
  // ([data-cribbage-active-pane-content]). Anchor is layout-inert
  // (absolute, pointer-events:none) and sits at top-center of the pane
  // so dropped cards land at the natural top-of-hand position.
  const [selfHandRegion, setSelfHandRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.querySelector('[data-cribbage-active-pane-content]') as HTMLElement | null;
    setSelfHandRegion(find());
    const observer = new MutationObserver(() => {
      const next = find();
      setSelfHandRegion(prev => (prev === next ? prev : next));
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
      data-canonical-self-hand-anchor-position="cribbage-active-pane-top"
      data-anchor-owner="CribbageDealOrchestrator.selfHandRegion"
    />
  );

  return selfHandRegion ? createPortal(anchorEl, selfHandRegion) : null;
}
