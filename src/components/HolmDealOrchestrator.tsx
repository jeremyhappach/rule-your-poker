/**
 * HolmDealOrchestrator — canonical deal for Holm.
 *
 * Three waves, all routed through the canonical CardTransport +
 * DealRuntime substrate.
 *
 *   1. HANDS wave    — buck-first, clockwise.
 *                      First card → seat at buckPosition, then +1, +2…
 *                      Self cards stamp `visibleFace` from authoritative
 *                      `selfHand` so destinations render face-up on claim.
 *                      Opp cards face-down.
 *                      Origin: dealer seat (canonical rule).
 *
 *   2. COMMUNITY wave — 4 cards (`beginWave(4)`).
 *                      C0/C1 land face-up (visibleFace stamped from
 *                      communityCards[0..1]).
 *                      C2/C3 land face-down (no visibleFace; destination
 *                      renders cardback until existing reveal flips them).
 *                      All four fly as CanonicalCardBack.
 *
 *   3. CHUCKY wave   — solo only. `beginWave(chuckyCards.length)`.
 *                      All face-down, lands face-down. Existing Chucky
 *                      reveal sequence consumes the pile post-settle.
 *
 * Timer policy: Holm timers are derived from actionability
 * (canPlayerAct), NOT from DealRuntime phase. This orchestrator does
 * not touch timer state.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { DealRuntime, useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { getCanonicalSlotPlacement } from '@/lib/canonicalShell/canonicalSlotPlacement';
import { SLOT } from '@/lib/canonicalShell/seatAnchors';
import { nextClockwise } from '@/lib/canonicalShell/seatRing';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot, useDealTimingHydrated } from '@/lib/geometryLab/dealTimingStore';
import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';
import { holmDbgEndpoint, holmDealDbgRecordWave, type HolmExpectedCardDbg } from '@/lib/canonicalShell/cardTransport/holmDealDbg';
import { holmTimelineRecordDispatch, holmTimelineResetForHand } from '@/lib/canonicalShell/cardTransport/holmCardTimeline';
import { recordHolmFull } from '@/lib/canonicalShell/cardTransport/holmFullForensics';
import type { Card as CardType } from '@/lib/cardUtils';


interface SeatEntry {
  playerId: string;
  position: number;
}

const SYMBOL_TO_WORD: Record<string, 'hearts' | 'diamonds' | 'clubs' | 'spades'> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
  spades: 'spades', hearts: 'hearts', diamonds: 'diamonds', clubs: 'clubs',
} as Record<string, 'hearts' | 'diamonds' | 'clubs' | 'spades'>;

function toVisibleFace(card: CardType): { rank: string; suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' } {
  const suitStr = String((card as any).suit ?? 'spades');
  return { rank: String(card.rank), suit: SYMBOL_TO_WORD[suitStr] ?? 'spades' };
}

export interface HolmDealOrchestratorProps {
  handContextId: string;
  /** All seated players (active hand participants). */
  seats: SeatEntry[];
  /** Seat that holds the Buck — first card recipient. */
  buckPosition: number;
  /** Dealer seat (card flight origin). */
  dealerPosition: number;
  /** Viewer playerId — receives visibleFace stamped self cards. */
  selfPlayerId: string;
  /** Viewer seat position — used to detect dealerIsSelf and mount a
   *  fallback `[data-card-anchor="seat-${dealerPosition}"]` origin since
   *  CanonicalSeatCluster suppresses the self-viewer's seat node. */
  selfPosition?: number | null;
  /** Cards-per-player for this hand (Holm hand size). */
  cardsPerPlayer: number;
  /**
   * Authoritative viewer self-hand. `null` is the PENDING-HCI sentinel
   * — until the active HCI is admitted, the orchestrator runs none of
   * resetForHand / beginDealForHand / beginWaveForHand / dispatch.
   * Caller MUST pass `null` (never `[]`) while pending.
   */
  selfHand: CardType[] | null;
  /** Authoritative community cards (length should reach 4 before community wave). */
  communityCards: CardType[];
  /** Solo-declared flag — drives whether chucky wave dispatches. */
  soloDeclared: boolean;
  /** Authoritative chucky pile (solo only). */
  chuckyCards: CardType[] | null | undefined;
}

export function HolmDealOrchestrator({
  handContextId,
  seats,
  buckPosition,
  dealerPosition,
  selfPlayerId,
  selfPosition = null,
  cardsPerPlayer,
  selfHand,
  communityCards,
  soloDeclared,
  chuckyCards,
}: HolmDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dealTimingHydrated = useDealTimingHydrated();
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  // dealerIsSelf — when true, CanonicalSeatCluster suppresses the
  // viewer's own seat node, so [data-card-anchor="seat-${dealerPosition}"]
  // is missing and every Holm intent drops with
  // missing-endpoint-after-retry. Mount a fallback origin anchor onto the
  // canonical shell felt HOME slot (same fix as 3-5-7).
  const dealerIsSelf =
    typeof dealerPosition === 'number' &&
    dealerPosition > 0 &&
    selfPosition === dealerPosition;
  const selfDealerFelt = useShellFeltFrameElement(dealerIsSelf);
  const selfDealerFeltIsSurface = !!selfDealerFelt?.hasAttribute('data-canonical-felt-surface');

  const handsDispatchedRef = useRef(false);
  const communityDispatchedRef = useRef(false);
  const chuckyDispatchedRef = useRef(false);
  const orchestratorRenderCountRef = useRef(0);
  orchestratorRenderCountRef.current += 1;

  // ── RUN-BACK FORENSICS: render-time snapshot of every gate, manifest
  // state, runtime ledger, and dispatch eligibility. Pure
  // instrumentation. Fires every render while DealRuntime phase is
  // PRE_DEAL so the export can identify the exact first failing guard.
  try {
    const selfHandHash = (selfHand ?? []).map((c: any) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`).join(',');
    const communityHash = (communityCards ?? []).map((c: any) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`).join(',');
    const chuckyHash = (chuckyCards ?? []).map((c: any) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`).join(',');
    const seatHash = seats.map((s) => `${s.position}:${s.playerId}`).join('|');

    // Hands gate evaluation (mirror of useEffect predicates).
    const handsGates = {
      dealMounted: !!deal,
      handsAlreadyDispatched: handsDispatchedRef.current,
      dealTimingHydrated,
      seatsNonEmpty: seats.length > 0,
      cardsPerPlayerPositive: cardsPerPlayer > 0,
      selfHandPresent: !!selfHand,
      selfHandSized: (selfHand?.length ?? 0) >= cardsPerPlayer,
      buckSeatInRing: seats.some((s) => s.position === buckPosition),
    };
    const handsFirstFailing = (() => {
      if (!handsGates.dealMounted) return 'NO_DEAL_RUNTIME';
      if (handsGates.handsAlreadyDispatched) return 'HANDS_ALREADY_DISPATCHED';
      if (!handsGates.dealTimingHydrated) return 'DEAL_TIMING_NOT_HYDRATED';
      if (!handsGates.seatsNonEmpty) return 'SEATS_EMPTY';
      if (!handsGates.cardsPerPlayerPositive) return 'CARDS_PER_PLAYER_LE_ZERO';
      if (!handsGates.selfHandPresent) return 'SELF_HAND_NULL';
      if (!handsGates.selfHandSized) return 'SELF_HAND_UNDERSIZED';
      if (!handsGates.buckSeatInRing) return 'BUCK_SEAT_NOT_IN_RING';
      return 'NONE_PROCEED';
    })();

    const communityGates = {
      dealMounted: !!deal,
      communityAlreadyDispatched: communityDispatchedRef.current,
      handsDispatched: handsDispatchedRef.current,
      dealSettled: !!deal?.dealSettled,
      communityFour: (communityCards?.length ?? 0) >= 4,
    };
    const chuckyGates = {
      dealMounted: !!deal,
      chuckyAlreadyDispatched: chuckyDispatchedRef.current,
      soloDeclared,
      communityDispatched: communityDispatchedRef.current,
      dealSettled: !!deal?.dealSettled,
      chuckyNonEmpty: (chuckyCards?.length ?? 0) > 0,
    };

    if (deal?.phase === 'PRE_DEAL' || deal?.phase === 'DEALING') {
      recordHolmFull({
        category: 'RUNTIME_WRITE',
        event: 'HOLM_ORCHESTRATOR_RENDER_SNAPSHOT',
        source: 'HolmDealOrchestrator',
        sourceCategory: 'RENDER_DERIVATION',
        callsite: 'src/components/HolmDealOrchestrator.tsx:render',
        commitId: orchestratorRenderCountRef.current,
        identityOverrides: { handContextId },
        payload: {
          handContextId,
          phase: deal?.phase ?? null,
          dealSettled: deal?.dealSettled ?? null,
          readyReleased: deal?.readyReleased ?? null,
          dealerPosition,
          buckPosition,
          selfPlayerId,
          selfPosition,
          cardsPerPlayer,
          selfHand: { count: selfHand?.length ?? 0, hash: selfHandHash },
          communityCards: { count: communityCards?.length ?? 0, hash: communityHash },
          chuckyCards: { count: chuckyCards?.length ?? 0, hash: chuckyHash },
          soloDeclared,
          seats: { count: seats.length, hash: seatHash },
          dispatchedRefs: {
            hands: handsDispatchedRef.current,
            community: communityDispatchedRef.current,
            chucky: chuckyDispatchedRef.current,
          },
          dealRuntime: deal ? {
            phase: deal.phase,
            gameType: deal.gameType,
            handContextId: deal.handContextId,
            dealSettled: deal.dealSettled,
            readyReleased: deal.readyReleased,
            timerAllowed: deal.timerAllowed,
          } : null,
          handsGates,
          handsFirstFailingGate: handsFirstFailing,
          communityGates,
          chuckyGates,
          dealTimingHydrated,
        },
      });
    }
  } catch { /* never throw from instrumentation */ }


  // Helper to build an intent with shared timing metadata.
  const buildIntents = (
    specs: Array<{
      cardId: string;
      to: CardTransportIntent['to'];
      face: CardTransportIntent['face'];
      recipientPlayerId?: string;
      visibleFace?: CardTransportIntent['visibleFace'];
    }>,
    fromOverride?: CardTransportIntent['from'],
  ): CardTransportIntent[] => {
    const emitTime = performance.now();
    const inspect = isCardTransportInspectMode();
    const timing = getDealTimingSnapshot();
    const intentTimingSource: 'GeometryLab' | 'inspectionMode' = inspect ? 'inspectionMode' : 'GeometryLab';
    const staggerMs = inspect ? 800 : timing.launchSpacingMs;
    const durationMs = inspect ? 600 : timing.durationMs;
    const launchDelayFormula = inspect
      ? 'idx * inspectionMode.launchSpacingMs(800)'
      : `idx * DealTimingStore.launchSpacingMs(${timing.launchSpacingMs}) @v${timing.storeVersion}`;
    const from: CardTransportIntent['from'] = fromOverride ?? { kind: 'seat', position: dealerPosition };

    return specs.map((s, idx) => {
      const launchDelayMs = idx * staggerMs;
      return {
        id: s.cardId,
        cardId: s.cardId,
        face: s.face,
        from,
        to: s.to,
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
        recipientPlayerId: s.recipientPlayerId,
        cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
        visibleFace: s.visibleFace,
      };
    });
  };

  // Buck presentation overlay (BucksOnYou) plays in parallel with the
  // deal and must NOT block dispatch. Gate subscription removed.

  // ── 1. HANDS WAVE — buck-first, clockwise ─────────────────────────
  useEffect(() => {
    if (!deal || handsDispatchedRef.current) return;
    if (!dealTimingHydrated) return;
    if (!seats.length || cardsPerPlayer <= 0) return;
    if (!selfHand || selfHand.length < cardsPerPlayer) return;

    // CLOCKWISE from buck (poker convention: nearest LOWER position w/ wrap).
    // seatRing.nextClockwise is the canonical ring traversal — do NOT
    // iterate the ascending-sorted seat array directly.
    const positions = seats.map(s => s.position);
    const byPos = new Map(seats.map(s => [s.position, s]));
    if (!byPos.has(buckPosition)) return;
    const ring: SeatEntry[] = [];
    let cur = buckPosition;
    for (let i = 0; i < seats.length; i++) {
      const seat = byPos.get(cur);
      if (!seat) return;
      ring.push(seat);
      if (i < seats.length - 1) cur = nextClockwise(cur, positions);
    }

    const specs: Parameters<typeof buildIntents>[0] = [];
    let selfRound = 0;
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (const r of ring) {
        const isSelf = r.playerId === selfPlayerId;
        const cardId = `${handContextId}#hand-${specs.length}`;
        const visibleFace = isSelf && selfHand[selfRound]
          ? toVisibleFace(selfHand[selfRound])
          : undefined;
        if (isSelf) selfRound++;
        specs.push({
          cardId,
          to: isSelf
            ? { kind: 'hand', playerId: selfPlayerId }
            : { kind: 'oppStack', position: r.position },
          face: 'hidden',
          recipientPlayerId: r.playerId,
          visibleFace,
        });
      }
    }

    const intents = buildIntents(specs);
    handsDispatchedRef.current = true;
    const beginAt = performance.now();
    holmTimelineResetForHand(handContextId);
    try { recordHolmFull({ category: 'RUNTIME_WRITE', event: 'HOLM_BEGIN_DEAL_FOR_HAND', source: 'HolmDealOrchestrator.handsEffect', sourceCategory: 'EFFECT', callsite: 'src/components/HolmDealOrchestrator.tsx:337', identityOverrides: { handContextId }, payload: { wave: 'hands', intentCount: intents.length, beginAt, dealPhase: deal.phase } }); } catch { /* */ }
    deal.beginDeal(intents.length);
    holmDealDbgRecordWave({
      handContextId,
      wave: 'hands',
      expected: intents.length,
      dispatched: intents.length,
      beginAt,
      cards: intents.map((intent, index): HolmExpectedCardDbg => ({
        cardId: intent.cardId,
        wave: 'hands',
        endpoint: holmDbgEndpoint(intent.to),
        playerId: intent.recipientPlayerId ?? null,
        seatPosition: intent.to.kind === 'oppStack' ? intent.to.position : null,
        index,
      })),
      buckPosition,
      dealerPosition,
      seatOrder: ring.map((s) => s.position),
      seatPlayerIds: ring.map((s) => s.playerId),
      selfPlayerId,
      soloDeclared,
    });
    const dispatchAt = performance.now();
    for (const intent of intents) holmTimelineRecordDispatch(intent.cardId, 'hands', holmDbgEndpoint(intent.to), dispatchAt);
    try { recordHolmFull({ category: 'TRANSPORT', event: 'HOLM_DISPATCH_MANY', source: 'HolmDealOrchestrator.handsEffect', sourceCategory: 'EFFECT', callsite: 'src/components/HolmDealOrchestrator.tsx:361', identityOverrides: { handContextId }, payload: { wave: 'hands', intentCount: intents.length, dispatchAt } }); } catch { /* */ }
    ct.dispatchMany(intents);

  }, [
    deal, ct, handContextId, seats, buckPosition, dealerPosition,
    selfPlayerId, cardsPerPlayer, selfHand, cardBackColors, dealTimingHydrated,
  ]);

  // ── 2. COMMUNITY WAVE (4 cards) ───────────────────────────────────
  useEffect(() => {
    if (!deal || communityDispatchedRef.current) return;
    if (!handsDispatchedRef.current) return;
    if (!deal.dealSettled) return; // hands wave must fully settle first
    if (!communityCards || communityCards.length < 4) return;

    const specs: Parameters<typeof buildIntents>[0] = [];
    for (let i = 0; i < 4; i++) {
      const card = communityCards[i];
      const cardId = `${handContextId}#community-${i}`;
      const visibleFace = i < 2 ? toVisibleFace(card) : undefined;
      specs.push({
        cardId,
        to: { kind: 'community', index: i },
        face: 'hidden',
        visibleFace,
      });
    }

    const intents = buildIntents(specs);
    communityDispatchedRef.current = true;
    const beginAt = performance.now();
    deal.beginWave(intents.length);
    holmDealDbgRecordWave({
      handContextId,
      wave: 'community',
      expected: intents.length,
      dispatched: intents.length,
      beginAt,
      cards: intents.map((intent, index): HolmExpectedCardDbg => ({
        cardId: intent.cardId,
        wave: 'community',
        endpoint: holmDbgEndpoint(intent.to),
        playerId: null,
        seatPosition: null,
        index,
      })),
    });
    const dispatchAtC = performance.now();
    for (const intent of intents) holmTimelineRecordDispatch(intent.cardId, 'community', holmDbgEndpoint(intent.to), dispatchAtC);
    ct.dispatchMany(intents);
  }, [deal, ct, handContextId, communityCards, cardBackColors, dealTimingHydrated, deal?.dealSettled]);

  // ── 3. CHUCKY WAVE (solo only) ────────────────────────────────────
  useEffect(() => {
    if (!deal || chuckyDispatchedRef.current) return;
    if (!soloDeclared) return;
    if (!communityDispatchedRef.current) return;
    if (!deal.dealSettled) return; // community wave must settle first
    if (!chuckyCards || chuckyCards.length === 0) return;

    const specs: Parameters<typeof buildIntents>[0] = chuckyCards.map((_, i) => ({
      cardId: `${handContextId}#chucky-${i}`,
      to: { kind: 'chucky', index: i },
      face: 'hidden' as const,
      visibleFace: undefined,
    }));

    const intents = buildIntents(specs);
    chuckyDispatchedRef.current = true;
    const beginAt = performance.now();
    deal.beginWave(intents.length);
    holmDealDbgRecordWave({
      handContextId,
      wave: 'chucky',
      expected: intents.length,
      dispatched: intents.length,
      beginAt,
      cards: intents.map((intent, index): HolmExpectedCardDbg => ({
        cardId: intent.cardId,
        wave: 'chucky',
        endpoint: holmDbgEndpoint(intent.to),
        playerId: null,
        seatPosition: null,
        index,
      })),
      soloDeclared,
    });
    const dispatchAtK = performance.now();
    for (const intent of intents) holmTimelineRecordDispatch(intent.cardId, 'chucky', holmDbgEndpoint(intent.to), dispatchAtK);
    ct.dispatchMany(intents);
  }, [deal, ct, handContextId, soloDeclared, chuckyCards, cardBackColors, dealTimingHydrated, deal?.dealSettled]);

  // ── Self-hand anchor — portal a 1×1 anchor at top of active pane ──
  //
  // WAR-TIME CONTRACT: the self-hand anchor MUST live inside
  // [data-holm-active-hand-region] (the ACTIVE_SELF_HAND owner). It
  // must NEVER render inside tabled / lone-player / solo-showdown
  // geometry. We therefore:
  //   (a) only render the anchor when an active region is in the DOM,
  //   (b) keep re-querying via MutationObserver so the anchor follows
  //       region remounts across hand boundaries,
  //   (c) never render an inline (non-portaled) fallback — a missing
  //       region means NO anchor, not "anchor in whatever DOM happens
  //       to surround the orchestrator (which is often the tabled
  //       presentation stage at hand boundary)".
  const [selfHandRegion, setSelfHandRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const findRegion = (): HTMLElement | null =>
      (document.querySelector('[data-holm-active-hand-region]') as HTMLElement | null) ??
      (document.querySelector('[data-357-active-hand-region]') as HTMLElement | null);
    setSelfHandRegion((prev) => {
      const next = findRegion();
      return prev === next ? prev : next;
    });
    const mo = new MutationObserver(() => {
      const next = findRegion();
      setSelfHandRegion((prev) => (prev === next ? prev : next));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
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
      data-anchor-owner="HolmDealOrchestrator.selfHandRegion"
    />
  );
  const selfDealerOriginEl =
    dealerIsSelf && selfDealerFelt && selfDealerFeltIsSurface ? (
      <div
        aria-hidden="true"
        className={`absolute ${getCanonicalSlotPlacement(SLOT.HOME).className} pointer-events-none`}
        style={{ width: 40, height: 40 }}
        data-card-anchor={`seat-${dealerPosition}`}
        data-canonical-dealer-origin-self="holm"
        data-canonical-shell-viewer-card-endpoint="holm-dealer-origin"
        data-anchor-owner="HolmDealOrchestrator.selfDealerFeltOrigin"
      />
    ) : null;
  return (
    <>
      {selfHandRegion ? createPortal(anchorEl, selfHandRegion) : null}
      {selfDealerOriginEl && selfDealerFelt
        ? createPortal(selfDealerOriginEl, selfDealerFelt)
        : null}
    </>
  );
}

// ─── DealRuntime per-hand wrapper ──────────────────────────────────
/**
 * Mounts a single DealRuntime keyed by `handContextId` for Holm hands.
 * Pass-through when `gameType !== 'holm-game'` or no handContextId, so
 * it can be nested safely outside (or alongside) other game wrappers.
 */
export function HolmDealRuntimeMaybe({
  handContextId,
  gameType,
  children,
}: {
  handContextId: string | null | undefined;
  gameType: string | null | undefined;
  children: ReactNode;
}) {
  if (gameType !== 'holm-game' || !handContextId) return <>{children}</>;
  return (
    <DealRuntime key={handContextId} handContextId={handContextId} gameType="holm-game">
      {children}
    </DealRuntime>
  );
}

// ─── Phase host ────────────────────────────────────────────────────
/**
 * Drives READY → GAMEPLAY transition for Holm.
 *
 *   multi: enterGameplay once community wave has settled (community-3 in).
 *   solo:  enterGameplay once chucky wave has settled (chucky-(N-1) in).
 *
 * Idempotent — uses a ref latch.
 */
export function HolmDealPhaseHost({
  handContextId,
  soloDeclared,
  chuckyCount,
  isPresentationHost,
  roundStatus,
}: {
  handContextId: string;
  soloDeclared: boolean;
  chuckyCount: number;
  /**
   * True iff the local viewer is the elected session presentation host
   * for this game (mirrors `isCreator` from Game.tsx, which itself
   * resolves to `games.current_host` or the canonical fallback).
   * Non-host clients NEVER submit the promotion RPC; they only
   * observe `rounds.status='betting'` via realtime and then release
   * local gameplay presentation via `enterGameplay()`.
   */
  isPresentationHost: boolean;
  /**
   * Authoritative round status from realtime. The host gates the
   * single promotion submission on `'dealing'`; all clients gate the
   * release of local gameplay on `'betting'`.
   */
  roundStatus: string | null | undefined;
}) {
  const deal = useDealRuntime();
  // Host-side promotion latch: keyed on `${handContextId}#promote` so
  // rerenders cannot duplicate the request. Reconnect/remount of the
  // same HCI naturally re-arms this latch and the RPC is idempotent.
  const promoteFiredRef = useRef<string | null>(null);
  // Local enterGameplay latch: fires exactly once per HCI when the
  // authoritative `rounds.status` transitions to `'betting'` AND the
  // host-visible settle predicate is true. Independent of host role.
  const gameplayReleasedRef = useRef<string | null>(null);

  // Host visible deal-settled predicate for THIS hci.
  const settlePredicateMet = (() => {
    if (!deal) return false;
    if (!deal.dealSettled) return false;
    if (deal.phase !== 'READY') return false;
    if (soloDeclared) {
      if (chuckyCount <= 0) return false;
      const lastChucky = `${handContextId}#chucky-${chuckyCount - 1}`;
      return deal.isSettled(lastChucky);
    }
    const lastCommunity = `${handContextId}#community-3`;
    return deal.isSettled(lastCommunity);
  })();

  // (1) Host promotion submission — exactly once per HCI per page life.
  // The RPC is idempotent on the server side; same-HCI repeat returns
  // `already_active` after the first success.
  useEffect(() => {
    if (!isPresentationHost) return;
    if (!handContextId) return;
    if (!settlePredicateMet) return;
    if (roundStatus !== 'dealing') return; // Already promoted; nothing to do.
    if (promoteFiredRef.current === handContextId) return;
    promoteFiredRef.current = handContextId;

    (async () => {
      try {
        // Read the current generation token so the RPC's CAS matches.
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: roundRow } = await supabase
          .from('rounds')
          .select('presentation_generation, status')
          .eq('id', handContextId)
          .maybeSingle();
        const generation = (roundRow as any)?.presentation_generation;
        if (typeof generation !== 'number') return;
        if ((roundRow as any)?.status !== 'dealing') return;
        await supabase.rpc(
          'activate_holm_round_after_deal_presentation' as any,
          {
            _round_id: handContextId,
            _hand_context_id: handContextId,
            _presentation_generation: generation,
            _from_fallback: false,
          } as any,
        );
      } catch {
        // Fail-safe: server fallback will promote after
        // presentation_fallback_at. We do NOT clear the latch — the
        // host is not the source of truth for this round any more.
      }
    })();
  }, [isPresentationHost, handContextId, settlePredicateMet, roundStatus]);

  // (2) Local gameplay release — every client (host AND non-host).
  // Waits for authoritative `roundStatus === 'betting'` realtime AND
  // the local settle predicate. Calls enterGameplay() once per HCI.
  useEffect(() => {
    if (!deal) return;
    if (!handContextId) return;
    if (gameplayReleasedRef.current === handContextId) return;
    if (roundStatus !== 'betting') return;
    if (!settlePredicateMet) return;
    gameplayReleasedRef.current = handContextId;
    deal.enterGameplay();
  }, [deal, handContextId, roundStatus, settlePredicateMet]);

  return null;
}

// ─── Settled-id reader ────────────────────────────────────────────
/**
 * Returns a Set-like helper for `cardId → settled?` checks.
 * Null when there is no active DealRuntime — consumers should treat
 * null as "render legacy path".
 */
export function useHolmSettledIds(): { has: (cardId: string) => boolean } | null {
  const deal = useDealRuntime();
  if (!deal) return null;
  return { has: (id: string) => deal.isSettled(id) };
}

/**
 * Renders children iff `cardId` is settled in the active DealRuntime.
 * Falls back to rendering when no DealRuntime is mounted (legacy path).
 */
export function HolmSettledGate({
  cardId,
  children,
}: {
  cardId: string;
  children: ReactNode;
}) {
  const settled = useHolmSettledIds();
  if (!settled) return <>{children}</>;
  return settled.has(cardId) ? <>{children}</> : null;
}
