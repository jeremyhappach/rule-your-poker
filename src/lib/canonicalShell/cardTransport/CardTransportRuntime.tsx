/**
 * CardTransportRuntime — owns launch, travel, arrival, destroy.
 *
 *   game emits intent
 *     ↓
 *   resolve from/to via [data-card-anchor]
 *     ↓
 *   mount transient flying card in overlay
 *     ↓
 *   single continuous keyframe: translate(0,0) → translate(dx,dy)
 *     ↓
 *   on arrival: __markSettled(intentId, cardId)
 *     ↓
 *   destroy flying node (destination consumer takes ownership)
 *
 * MOTION CONTRACT
 *   ONE continuous flight. No mid-flight scale bounce. No intermediate
 *   keyframe stops. Linear translate, easing applied by the animation
 *   timing function only. If the dbg panel sees more than one phase of
 *   transform interpolation, that is a bug.
 *
 * CARDBACK CONTRACT
 *   Hidden flights render the canonical cardback (same DOM/styles as
 *   CribbagePlayingCard faceDown) using `cardBackColors` stamped by the
 *   game from useVisualPreferences().getCardBackColors(). No generic
 *   red fallback when colors are absent — falls back to the same
 *   default (#00308F/#001a4a) CribbagePlayingCard uses.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useCardTransportInternal, type ActiveCardIntent } from './CardTransportProvider';
import { resolveCardEndpoint, type ResolvedCardEndpoint } from './cardEndpoints';
import { auditHolmEndpointResolution } from './holmEndpointAudit';
import { recordCribbageTransportIntentLifecycle } from '@/lib/cribbage/cribbageWartimeLedger';
import { CanonicalCardBack } from '@/components/canonicalShell/CanonicalCardBack';
import { getDealTiming } from '@/lib/geometryLab/dealTimingStore';
import {
  cardTransportDbgUpsert,
  cardTransportDbgSample,
  type CardTransportDbgSample,
} from './cardTransportDbg';
import { record357CardOwnership } from './threeFiveSevenPresentationForensics';
import { record357DealLandingTrace } from './threeFiveSevenDealLandingTrace';
import { holmTimelineRecordArrival, holmTimelineRecordClaim, holmTimelineRecordLaunch } from './holmCardTimeline';
import { updateHolmTransportInventory, registerHolmCardOwner, unregisterHolmCardOwner } from './holmCardOwnership';

const DEFAULT_DURATION_MS = 110;
const CARD_W = 44;
const CARD_H = 66; // 2:3 aspect, matches CribbagePlayingCard md tokens proportionally

/**
 * Inspect Mode is OFF. Deal timing comes from Geometry Lab Deal Timing
 * values exclusively. The opt-in escape hatch
 * `window.__CARD_TRANSPORT_INSPECT_MODE = true` is preserved for
 * one-off manual diagnosis but is no longer the default.
 */
export function isCardTransportInspectMode(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __CARD_TRANSPORT_INSPECT_MODE?: boolean };
  return w.__CARD_TRANSPORT_INSPECT_MODE === true;
}

const INSPECT_EASING = 'cubic-bezier(.25,.8,.25,1)';
const NORMAL_EASING = 'ease-out';
const launchProofByHand = new Map<string, Map<number, { start: number; delay: number }>>();

function isHolmTimelineCardId(cardId: string): boolean {
  return cardId.includes('#hand-') || cardId.includes('#community-') || cardId.includes('#chucky-');
}

function cardIndexFromIntentId(intentId: string): number | null {
  const m = intentId.match(/#card-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function isThreeFiveSevenSelfHandIntent(intent: ActiveCardIntent): boolean {
  return intent.to.kind === 'hand' && /#h\d+#r\d+$/.test(intent.handContextId ?? '');
}

function endpointAsDestinationRect(ep: ResolvedCardEndpoint) {
  return {
    x: +(ep.x - ep.w / 2).toFixed(2),
    y: +(ep.y - ep.h / 2).toFixed(2),
    w: +ep.w.toFixed(2),
    h: +ep.h.toFixed(2),
  };
}

interface RuntimeCard {
  intent: ActiveCardIntent;
  from: ResolvedCardEndpoint;
  to: ResolvedCardEndpoint;
  delayMs: number;
  flightMs: number;
  ownershipClaimDelayMs: number;
  startedAt: number;
  /** Wall-clock time at which this card's flight should begin (and node mount). */
  launchAt: number;
  /** True once the launch timer has fired and the FlyingCard node is mounted. */
  launched: boolean;
}

export interface CardTransportRuntimeProps {
  containerRef: RefObject<HTMLElement>;
  overlayRootRef: RefObject<HTMLElement>;
}

export function CardTransportRuntime({
  containerRef,
  overlayRootRef,
}: CardTransportRuntimeProps) {
  const ctx = useCardTransportInternal();
  const resolvedRef = useRef<Map<string, RuntimeCard>>(new Map());
  const launchTimersRef = useRef<Map<string, number>>(new Map());
  const settleTimersRef = useRef<Map<string, number>>(new Map());
  const resolveAttemptCountRef = useRef<Map<string, number>>(new Map());
  /**
   * Endpoint-resolution retry buffer. When `from`/`to` anchors are not
   * yet present (gameplay surface still mounting), park the intent here
   * instead of immediately calling `__markDropped`. A polling tick
   * re-attempts resolution every RETRY_INTERVAL_MS until either it
   * succeeds (intent promotes into `resolvedRef`) or MAX_PENDING_MS
   * elapses (then we drop).
   *
   * Without this buffer, an intent that landed during a single
   * missing-endpoint frame was being fake-settled by
   * `__markDropped → fireCallbacks` and DealRuntime marked the card as
   * arrived in ~60ms with `ownershipClaimTime` (claimAt) = null. That
   * is the bug surfaced by the Holm forensics timeline.
   */
  const pendingRef = useRef<Map<string, { intent: ActiveCardIntent; firstSeenAt: number }>>(new Map());
  const [resolveTick, setResolveTick] = useState(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const active = ctx?.__activeIntents ?? [];
  const activeIds = useMemo(() => active.map((i) => i.id).join('|'), [active]);

  const RETRY_INTERVAL_MS = 100;
  const MAX_PENDING_MS = 3000;

  useLayoutEffect(() => {
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) {
      for (const intent of active) {
        cardTransportDbgUpsert(intent.id, {
          cardId: intent.cardId,
          face: intent.face,
          from: intent.from,
          to: intent.to,
          endpointResolveAttemptedAt: performance.now(),
          endpointResolveAttemptCount: (resolveAttemptCountRef.current.get(intent.id) ?? 0) + 1,
          droppedReason: 'no-runtime-container',
          transportMounted: false,
          lifecycleState: 'dropped',
        });
        recordCribbageTransportIntentLifecycle('transport_intent_dropped', intent, {
          reason: 'no-runtime-container',
        });
        ctx.__markDropped(intent, 'no-runtime-container');
      }
      return;
    }

    let mutated = false;
    const seen = new Set<string>();
    const nowOuter = performance.now();
    for (const intent of active) {
      seen.add(intent.id);
      if (resolvedRef.current.has(intent.id)) continue;

      const attemptCount = (resolveAttemptCountRef.current.get(intent.id) ?? 0) + 1;
      resolveAttemptCountRef.current.set(intent.id, attemptCount);
      const from = resolveCardEndpoint(intent.from, container);
      const to = resolveCardEndpoint(intent.to, container);
      // WAR-TIME: Holm endpoint resolver assertions. Cheap no-op when no
      // Holm markers exist in the container (non-Holm games).
      const looksLikeHolm =
        !!container.querySelector('[data-holm-active-hand-region], [data-holm-lone-player-fan], [data-holm-tabled-self], [data-holm-solo-showdown], [data-card-anchor^="chucky-"]');
      if (looksLikeHolm) {
        auditHolmEndpointResolution({
          gameType: 'holm-game',
          handContextId: intent.handContextId ?? null,
          cardId: intent.cardId,
          endpoint: intent.from,
          resolved: from,
          container,
        });
        auditHolmEndpointResolution({
          gameType: 'holm-game',
          handContextId: intent.handContextId ?? null,
          cardId: intent.cardId,
          endpoint: intent.to,
          resolved: to,
          container,
        });
      }
      cardTransportDbgUpsert(intent.id, {
        cardId: intent.cardId,
        face: intent.face,
        from: intent.from,
        to: intent.to,
        handContextId: intent.handContextId ?? null,
        timingSource: intent.timingSource,
        dealTimingSettings: intent.dealTimingSettings,
        dealTimingStoreSnapshot: intent.dealTimingStoreSnapshot,
        intentTimingSource: intent.intentTimingSource,
        launchDelayFormula: intent.launchDelayFormula,
        expectedStartTime: intent.expectedStartTime,
        expectedArrivalTime: intent.expectedArrivalTime,
        activeIntentVisibleAt: intent.enqueuedAt,
        endpointResolveAttemptedAt: nowOuter,
        endpointResolveAttemptCount: attemptCount,
        lifecycleState: 'resolving',
        fromEndpointFound: !!from,
        toEndpointFound: !!to,
        resolvedFromAnchor: from?.resolvedAnchor ?? null,
        resolvedToAnchor: to?.resolvedAnchor ?? null,
        fromAnchorRect: from ? { x: from.x, y: from.y, w: from.w, h: from.h } : null,
        toAnchorRect:   to   ? { x: to.x,   y: to.y,   w: to.w,   h: to.h }   : null,
        fromAnchorOwner: from?.owner ?? null,
        toAnchorOwner: to?.owner ?? null,
        fromAnchorParent: from?.parent ?? null,
        toAnchorParent: to?.parent ?? null,
        fromAnchorViewportRect: from?.viewportRect ?? null,
        toAnchorViewportRect: to?.viewportRect ?? null,
        dealerIsSelf: intent.dealerIsSelf ?? null,
      });
      if (!from || !to) {
        // Park for retry — do NOT fake-settle via __markDropped on the
        // first missing-endpoint frame. The gameplay surface (seat
        // clusters, opp-stack, community, chucky anchors) may still be
        // mounting. Promote out of pending once anchors resolve.
        const existing = pendingRef.current.get(intent.id);
        const firstSeenAt = existing?.firstSeenAt ?? nowOuter;
        pendingRef.current.set(intent.id, { intent, firstSeenAt });
        const waited = nowOuter - firstSeenAt;
        cardTransportDbgUpsert(intent.id, {
          droppedReason: null,
          transportMounted: false,
          queuedAt: firstSeenAt,
          lifecycleState: 'queued',
        });

        if (waited > MAX_PENDING_MS) {
          pendingRef.current.delete(intent.id);
          cardTransportDbgUpsert(intent.id, {
            droppedReason: 'missing-endpoint-after-retry',
            transportMounted: false,
            droppedAt: performance.now(),
            lifecycleState: 'dropped',
          });
          ctx.__markDropped(intent, 'missing-endpoint-after-retry');
        }
        continue;
      }
      // Endpoints resolved — promote out of pending.
      pendingRef.current.delete(intent.id);

      const delayMs = Math.max(0, intent.launchDelayMs ?? 0);
      const flightMs = intent.durationMs ?? DEFAULT_DURATION_MS;
      const ownershipClaimDelayMs = Math.max(0, intent.ownershipClaimDelayMs ?? getDealTiming().ownershipClaimDelayMs);
      const now = performance.now();
      const launchAt = now + delayMs;
      const record: RuntimeCard = {
        intent,
        from,
        to,
        delayMs,
        flightMs,
        ownershipClaimDelayMs,
        startedAt: now,
        launchAt,
        launched: delayMs === 0,
      };
      resolvedRef.current.set(intent.id, record);
      cardTransportDbgUpsert(intent.id, {
        transportMounted: false,
        transportVisible: false,
        endpointResolvedAt: now,
        lifecycleState: delayMs > 0 ? 'queued' : 'launched',
        ...(delayMs > 0 ? { queuedAt: now } : { launchedAt: now }),
        launchDelayMs: delayMs,
        durationMs: flightMs,
        ownershipClaimDelayMs,
        dx: to.x - from.x,
        dy: to.y - from.y,
        portalLayer: 'overlay-root',
      });

      // Schedule the node mount at the launch time. No CSS animation-delay —
      // this keeps the dealer origin clear until the card is actually launching.
      if (delayMs > 0) {
        const tLaunch = window.setTimeout(() => {
          const r = resolvedRef.current.get(intent.id);
          if (!r) return;
          r.launched = true;
          if (isThreeFiveSevenSelfHandIntent(intent)) {
            const currentTo = resolveCardEndpoint(intent.to, container) ?? r.to;
            record357DealLandingTrace(intent.cardId, {
              intentId: intent.id,
              handContextId: intent.handContextId ?? null,
              transportLaunchTimestamp: performance.now(),
              finalLayoutPublishedTimestamp: currentTo.finalLayoutPublishedAt ?? intent.activeHandFinalLayoutPublishedAt ?? null,
              anchorRectAtLaunch: currentTo.viewportRect,
              flyingCardDestinationRectAtLaunch: endpointAsDestinationRect(r.to),
              fallbackUsed: currentTo.fallbackUsed ?? intent.dealLandingFallbackUsed ?? null,
              activeHandFanRenderKey: intent.activeHandFanRenderKey ?? null,
              transportAnchorRenderKey: currentTo.renderKey ?? r.to.renderKey ?? null,
              flyingCardRenderKey: `FlyingCard|${intent.id}`,
            });
          }
          cardTransportDbgUpsert(intent.id, {
            transportMounted: true,
            transportVisible: true,
            launchedAt: performance.now(),
            lifecycleState: 'launched',
          });
          launchTimersRef.current.delete(intent.id);
          rerender();
        }, delayMs);
        launchTimersRef.current.set(intent.id, tLaunch);
      } else {
        if (isThreeFiveSevenSelfHandIntent(intent)) {
          const currentTo = resolveCardEndpoint(intent.to, container) ?? to;
          record357DealLandingTrace(intent.cardId, {
            intentId: intent.id,
            handContextId: intent.handContextId ?? null,
            transportLaunchTimestamp: performance.now(),
            finalLayoutPublishedTimestamp: currentTo.finalLayoutPublishedAt ?? intent.activeHandFinalLayoutPublishedAt ?? null,
            anchorRectAtLaunch: currentTo.viewportRect,
            flyingCardDestinationRectAtLaunch: endpointAsDestinationRect(to),
            fallbackUsed: currentTo.fallbackUsed ?? intent.dealLandingFallbackUsed ?? null,
            activeHandFanRenderKey: intent.activeHandFanRenderKey ?? null,
            transportAnchorRenderKey: currentTo.renderKey ?? to.renderKey ?? null,
            flyingCardRenderKey: `FlyingCard|${intent.id}`,
          });
        }
        cardTransportDbgUpsert(intent.id, {
          transportMounted: true,
          transportVisible: true,
          flyingCardMountedAt: performance.now(),
          lifecycleState: 'flying_mounted',
        });
      }

      // Schedule settle relative to launch time (flight has no extra CSS delay).
      const tSettle = window.setTimeout(() => {
        const tnow = performance.now();
        if (isHolmTimelineCardId(intent.cardId)) {
          holmTimelineRecordArrival(intent.cardId, tnow);
          holmTimelineRecordClaim(intent.cardId, tnow);
        }
        cardTransportDbgUpsert(intent.id, {
          settled: true,
          transportVisible: false,
          ownershipClaimTime: tnow,
          markSettledAt: tnow,
          markSettledSource: 'timer_fallback',
          lifecycleState: 'settled',
        });
        record357CardOwnership(intent.cardId, { ownershipClaimed: true });
        settleTimersRef.current.delete(intent.id);
        ctx.__markSettled(intent.id, intent.cardId, 'timer_fallback');
      }, delayMs + flightMs + ownershipClaimDelayMs);
      settleTimersRef.current.set(intent.id, tSettle);

      mutated = true;
    }

    for (const id of Array.from(resolvedRef.current.keys())) {
      if (!seen.has(id)) {
        cardTransportDbgUpsert(id, {
          transportDestroyedTime: performance.now(),
          transportVisible: false,
        });
        const lt = launchTimersRef.current.get(id);
        if (lt != null) { window.clearTimeout(lt); launchTimersRef.current.delete(id); }
        const st = settleTimersRef.current.get(id);
        if (st != null) { window.clearTimeout(st); settleTimersRef.current.delete(id); }
        resolvedRef.current.delete(id);
        mutated = true;
      }
    }
    // Drop pending entries for intents no longer active (cancelled wave).
    for (const id of Array.from(pendingRef.current.keys())) {
      if (!seen.has(id)) pendingRef.current.delete(id);
    }
    if (mutated) rerender();

    // WAR-TIME ownership inventory snapshot (cheap, no logic impact).
    try {
      const resolved = Array.from(resolvedRef.current.values());
      const launched = resolved.filter((r) => r.launched);
      const pending = Array.from(pendingRef.current.values()).map((p) => p.intent);
      updateHolmTransportInventory({
        active: active.length,
        queued: pending.length,
        launched: launched.length,
        claimed: launched.length, // claim fires at settle-timer; approximate as launched
        settled: 0, // settled is owned by DealRuntime/Provider, not tracked here
        activeIds: active.slice(0, 20).map((i) => i.cardId),
        queuedIds: pending.slice(0, 20).map((i) => i.cardId),
        launchedIds: launched.slice(0, 20).map((r) => r.intent.cardId),
        claimedIds: launched.slice(0, 20).map((r) => r.intent.cardId),
        settledIds: [],
      });
    } catch { /* */ }
  }, [ctx, containerRef, activeIds, active, resolveTick]);

  // Retry tick — while pending intents exist, re-run the layout effect
  // every RETRY_INTERVAL_MS so anchors that mount after dispatch
  // (opp-stack / community / chucky / seat clusters appearing as the
  // game phase advances) resolve instead of being fake-settled.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (pendingRef.current.size === 0) return;
      setResolveTick((n) => n + 1);
    }, RETRY_INTERVAL_MS);
    return () => { window.clearInterval(id); };
  }, []);

  const overlay = overlayRootRef.current;
  if (!ctx || !overlay) return null;
  if (resolvedRef.current.size === 0) return null;

  const inspect = isCardTransportInspectMode();
  const easing = inspect ? INSPECT_EASING : NORMAL_EASING;

  const nodes: JSX.Element[] = [];
  for (const card of resolvedRef.current.values()) {
    if (!card.launched) continue;
    nodes.push(
      <FlyingCard
        key={card.intent.id}
        card={card}
        containerRef={containerRef}
        easing={easing}
      />,
    );
  }

  return createPortal(<>{nodes}</>, overlay);
}

// ---------------------------------------------------------------------------
// FlyingCard — one transient flying node. Captures lifecycle samples
// (launch / midflight / arrival) with full computed-style snapshots so
// the dbg panel can prove the flight is a single continuous animation.
// ---------------------------------------------------------------------------

interface FlyingCardProps {
  card: RuntimeCard;
  containerRef: RefObject<HTMLElement>;
  easing: string;
}

function FlyingCard({ card, containerRef, easing }: FlyingCardProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const launchLoggedRef = useRef(false);
  const arrivalLoggedRef = useRef(false);
  const actualStartRef = useRef<number | null>(null);
  const dx = card.to.x - card.from.x;
  const dy = card.to.y - card.from.y;
  const kf = `__cardFly_${card.intent.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const isHidden = card.intent.face === 'hidden';
  // Hidden-card colors are owned by CanonicalCardBack (reads useVisualPreferences
  // directly). `card.intent.cardBackColors` is retained on the intent for debug
  // parity but no longer drives paint here.
  const vf = card.intent.visibleFace;
  const suitChar = vf
    ? (vf.suit === 'hearts' ? '♥' : vf.suit === 'diamonds' ? '♦' : vf.suit === 'clubs' ? '♣' : '♠')
    : '';
  const suitColor = vf && (vf.suit === 'hearts' || vf.suit === 'diamonds') ? '#ef4444' : '#111827';

  // Consume the resolved destination card geometry when the landing
  // anchor is sized to the final rendered card rect (deal orchestrators
  // that publish through activeHandCardRectStore stamp the anchor
  // width/height to the committed active-hand card size). Fall back to
  // the canonical constants when the destination is a 1×1 point anchor.
  const FINAL_SIZE_MIN_PX = 8;
  const useFinalRect =
    Number.isFinite(card.to.w) &&
    Number.isFinite(card.to.h) &&
    card.to.w >= FINAL_SIZE_MIN_PX &&
    card.to.h >= FINAL_SIZE_MIN_PX;
  const flyW = useFinalRect ? card.to.w : CARD_W;
  const flyH = useFinalRect ? card.to.h : CARD_H;

  const logActualLaunch = (source: 'animationstart' | 'timer-fallback') => {
    if (launchLoggedRef.current) return;
    launchLoggedRef.current = true;
    const now = performance.now();
    actualStartRef.current = now;
    const cardIndex = cardIndexFromIntentId(card.intent.id);
    const handContextId = card.intent.handContextId ?? '__unknown_hand__';
    let actualStartDeltaFromPreviousMs: number | null = null;
    let expectedStartDeltaFromPreviousMs: number | null = null;
    let startDeltaErrorMs: number | null = null;
    if (cardIndex != null) {
      let byIndex = launchProofByHand.get(handContextId);
      if (!byIndex || cardIndex === 0) {
        byIndex = new Map<number, { start: number; delay: number }>();
        launchProofByHand.set(handContextId, byIndex);
      }
      const prev = byIndex.get(cardIndex - 1);
      actualStartDeltaFromPreviousMs = prev == null ? null : now - prev.start;
      expectedStartDeltaFromPreviousMs = prev == null ? null : card.delayMs - prev.delay;
      startDeltaErrorMs = actualStartDeltaFromPreviousMs == null || expectedStartDeltaFromPreviousMs == null
        ? null
        : actualStartDeltaFromPreviousMs - expectedStartDeltaFromPreviousMs;
      byIndex.set(cardIndex, { start: now, delay: card.delayMs });
    }
    const expectedStartTime = card.intent.expectedStartTime ?? card.startedAt + card.delayMs;
    cardTransportDbgUpsert(card.intent.id, {
      actualStartTime: now,
      animationStartAt: now,
      actualStartDeltaFromPreviousMs,
      expectedStartDeltaFromPreviousMs,
      startDeltaErrorMs,
      startSkewMs: now - expectedStartTime,
      launchProofSource: source,
      lifecycleState: 'flying_mounted',
    });
    if (isHolmTimelineCardId(card.intent.cardId)) {
      holmTimelineRecordLaunch(card.intent.cardId, now);
    }
    if (isThreeFiveSevenSelfHandIntent(card.intent)) {
      const container = containerRef.current;
      const currentTo = container ? resolveCardEndpoint(card.intent.to, container) : card.to;
      record357DealLandingTrace(card.intent.cardId, {
        intentId: card.intent.id,
        handContextId: card.intent.handContextId ?? null,
        transportLaunchTimestamp: now,
        finalLayoutPublishedTimestamp: currentTo?.finalLayoutPublishedAt ?? card.intent.activeHandFinalLayoutPublishedAt ?? null,
        anchorRectAtLaunch: currentTo?.viewportRect ?? null,
        flyingCardDestinationRectAtLaunch: endpointAsDestinationRect(card.to),
        fallbackUsed: currentTo?.fallbackUsed ?? card.intent.dealLandingFallbackUsed ?? !useFinalRect,
        activeHandFanRenderKey: card.intent.activeHandFanRenderKey ?? null,
        transportAnchorRenderKey: currentTo?.renderKey ?? card.to.renderKey ?? null,
        flyingCardRenderKey: `FlyingCard|${card.intent.id}`,
      });
    }
    // eslint-disable-next-line no-console
    console.log('[DEAL TIMING PROOF LAUNCH]', {
      intentId: card.intent.id,
      handContextId: card.intent.handContextId ?? null,
      cardIndex,
      launchDelayMs: card.delayMs,
      durationMs: card.flightMs,
      actualStartTime: now,
      actualArrivalTime: null,
      actualStartDeltaFromPreviousMs,
      expectedStartDeltaFromPreviousMs,
      startDeltaErrorMs,
      expectedStartTime,
      startSkewMs: now - expectedStartTime,
      intentTimingSource: card.intent.intentTimingSource,
      launchDelayFormula: card.intent.launchDelayFormula,
      storeSnapshot: card.intent.dealTimingStoreSnapshot,
      source,
    });
  };

  const logActualArrival = (source: 'animationend' | 'timer-fallback') => {
    if (arrivalLoggedRef.current) return;
    arrivalLoggedRef.current = true;
    const now = performance.now();
    const actualStartTime = actualStartRef.current;
    const expectedArrivalTime = card.intent.expectedArrivalTime ?? card.startedAt + card.delayMs + card.flightMs;
    cardTransportDbgUpsert(card.intent.id, {
      actualArrivalTime: now,
      animationEndAt: now,
      actualFlightDurationMs: actualStartTime == null ? null : now - actualStartTime,
      arrivalSkewMs: now - expectedArrivalTime,
      arrivalProofSource: source,
    });
    if (isHolmTimelineCardId(card.intent.cardId)) {
      holmTimelineRecordArrival(card.intent.cardId, now);
    }
    // eslint-disable-next-line no-console
    console.log('[DEAL TIMING PROOF ARRIVAL]', {
      intentId: card.intent.id,
      handContextId: card.intent.handContextId ?? null,
      cardIndex: cardIndexFromIntentId(card.intent.id),
      launchDelayMs: card.delayMs,
      durationMs: card.flightMs,
      actualStartTime,
      actualArrivalTime: now,
      actualFlightDurationMs: actualStartTime == null ? null : now - actualStartTime,
      expectedArrivalTime,
      arrivalSkewMs: now - expectedArrivalTime,
      intentTimingSource: card.intent.intentTimingSource,
      launchDelayFormula: card.intent.launchDelayFormula,
      storeSnapshot: card.intent.dealTimingStoreSnapshot,
      source,
    });
  };

  useEffect(() => {
    const intentId = card.intent.id;
    const node = elRef.current;
    if (!node) return;

    const snapshot = (phase: CardTransportDbgSample['phase']) => {
      const target = node.firstElementChild as HTMLElement | null;
      const el = target ?? node;
      const cs = window.getComputedStyle(el);
      const container = containerRef.current;
      let rect = null as CardTransportDbgSample['rect'];
      if (container) {
        const r = el.getBoundingClientRect();
        const c = container.getBoundingClientRect();
        rect = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
      }
      cardTransportDbgSample(intentId, {
        phase,
        t: performance.now(),
        animationName: cs.animationName,
        animationIterationCount: cs.animationIterationCount,
        animationPlayState: cs.animationPlayState,
        animationTimingFunction: cs.animationTimingFunction,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        transform: cs.transform,
        rect,
      });
    };

    // Synchronous snapshot at mount — animation has not yet kicked off
    // (delay phase). Captures the resolved CSS so we can see the
    // SINGLE animation token before any frames render.
    snapshot('launch');

    // Node is mounted at launch time — animation begins immediately,
    // there is no CSS animation-delay. Snapshots are relative to mount.
    const startAt = 0;
    const midAt = card.flightMs / 2;
    const endAt = card.flightMs;

    window.setTimeout(() => logActualLaunch('timer-fallback'), Math.max(0, startAt + 20));
    window.setTimeout(() => logActualArrival('timer-fallback'), Math.max(0, endAt + 20));
    const tLaunch = window.setTimeout(() => snapshot('launch'), Math.max(0, startAt + 16));
    const tMid    = window.setTimeout(() => snapshot('midflight'), midAt);
    const tEnd    = window.setTimeout(() => snapshot('arrival'), Math.max(0, endAt - 8));

    // Card-ownership forensics — transport mount.
    record357CardOwnership(card.intent.cardId, {
      intentId: card.intent.id,
      handContextId: card.intent.handContextId ?? null,
      transportMounted: true,
      transportVisible: true,
      transportMountTime: performance.now(),
    });
    cardTransportDbgUpsert(intentId, {
      flyingCardMountedAt: performance.now(),
      transportMounted: true,
      transportVisible: true,
      lifecycleState: 'flying_mounted',
    });
    const holmOwnerInstance = registerHolmCardOwner({
      cardId: card.intent.cardId,
      renderer: 'CardTransportRuntime.FlyingCard',
      componentName: 'FlyingCard',
      handContextId: card.intent.handContextId ?? null,
      phase: 'TRANSPORT',
      renderReason: 'launched',
    });

    return () => {
      window.clearTimeout(tLaunch);
      window.clearTimeout(tMid);
      window.clearTimeout(tEnd);
      // Destroy snapshot — captured before React unmounts the element.
      try { snapshot('destroy'); } catch { /* */ }
      const destroyT = performance.now();
      cardTransportDbgUpsert(intentId, {
        transportDestroyedTime: destroyT,
      });
      record357CardOwnership(card.intent.cardId, {
        transportMounted: false,
        transportVisible: false,
        transportDestroyTime: destroyT,
      });
      unregisterHolmCardOwner(card.intent.cardId, holmOwnerInstance);
    };
  }, [card.intent.id, card.intent.cardId, card.intent.handContextId, card.delayMs, card.flightMs, containerRef]);

  return (
    <div
      ref={elRef}
      data-card-transport-intent={card.intent.id}
      data-card-transport-card-id={card.intent.cardId}
      data-card-transport-face={card.intent.face}
      data-card-transport-flying="true"
      data-recipient-player-id={card.intent.recipientPlayerId ?? ''}

      style={{
        position: 'absolute',
        left: card.from.x,
        top: card.from.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 82,
      }}
    >
      <div
        style={{
          width: flyW,
          height: flyH,
          borderRadius: 2,
          border: isHidden ? 'none' : '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
          background: isHidden ? 'transparent' : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isHidden ? 'center' : 'space-between',
          padding: isHidden ? 0 : '2px 0',
          overflow: 'hidden',
          opacity: 0,
          animation: `${kf} ${card.flightMs}ms ${easing} 0ms 1 forwards`,
          willChange: 'transform, opacity',
        }}
        onAnimationStart={() => logActualLaunch('animationstart')}
        onAnimationEnd={() => logActualArrival('animationend')}
      >
        {isHidden ? (
          // CANONICAL hidden-card renderer. Gradient/border/accent owned
          // by shell; stamped cardBackColors on the intent are ignored
          // for paint purposes (kept on the intent for debug parity).
          <CanonicalCardBack
            widthPx={flyW}
            heightPx={flyH}
            variant="flat"
            radiusPx={2}
            style={{ width: '100%', height: '100%' }}
          />
        ) : vf ? (
          <>
            <span style={{ fontSize: `${flyW * 0.55}px`, fontWeight: 900, lineHeight: 1, color: suitColor }}>{vf.rank}</span>
            <span style={{ fontSize: `${flyW * 0.7}px`, lineHeight: 1, color: suitColor }}>{suitChar}</span>
          </>
        ) : null}
      </div>
      <style>{`@keyframes ${kf} {
        from { transform: translate(0, 0); opacity: 1; }
        to   { transform: translate(${dx}px, ${dy}px); opacity: 1; }
      }`}</style>
    </div>
  );
}
