/**
 * ThreeFiveSevenDealOrchestrator — Wave 3 canonical staged deal for 3-5-7.
 *
 * Per-wave (round) orchestrator. Each round/stage runs as its own deal
 * wave keyed by the parent DealRuntime (`${dealerGameId}#h${hand}#r${round}`):
 *
 *   round 1 → 3 cards per active player
 *   round 2 → +2 per active player
 *   round 3 → +2 per active player
 *
 * Order: start at seat-left-of-dealer in the active ring, then proceed
 * in normal table (position) order, repeating until cardsThisWave passes
 * are emitted. Dealer never receives the first card in a normal multi-
 * player rotation.
 *
 * Corrections enforced:
 *   - face: 'hidden' on every intent (no face-up flying deal cards)
 *   - from: { kind: 'seat', position: dealerPosition } ALWAYS (dealer seat,
 *     even when the viewer is the dealer — the dealer seat is the
 *     canonical visual source, NOT the self hand anchor)
 *
 * The destination anchor `[data-card-anchor="hand-${selfPlayerId}"]` is
 * mounted here as a 1×1 invisible terminus so self-recipient intents
 * have a stable arrival point.
 *
 * Also exports two thin helper components so MobileGameTable can read
 * the active DealRuntime from React's tree (it must run UNDER the
 * provider):
 *
 *   <Use357OppCount playerId expected baseline render={(count)=>...}/>
 *   <Use357SelfHand currentPlayerId cards baseline render={(cards)=>...}/>
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCardTransport } from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import { useDealRuntime, DealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { isCardTransportInspectMode } from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { getCanonicalSlotPlacement } from '@/lib/canonicalShell/canonicalSlotPlacement';
import { SLOT } from '@/lib/canonicalShell/seatAnchors';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { getDealTimingSnapshot, useDealTimingHydrated } from '@/lib/geometryLab/dealTimingStore';
import { dealDbgUpsertOwnership } from '@/lib/canonicalShell/cardTransport/cardTransportDbg';
import {
  recordThreeFiveSevenHandRender,
  unregisterThreeFiveSevenHandRender,
} from '@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore';
import {
  record357CardOwnership,
  record357DiagnosticViolation,
  type CardHiddenReason,
} from '@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics';
import { useActiveHandCardRect } from '@/lib/activeHand/activeHandCardRectStore';

import type { CardTransportIntent } from '@/lib/canonicalShell/cardTransport/types';

export interface ThreeFiveSevenSeatEntry {
  playerId: string;
  position: number;
}

export interface ThreeFiveSevenDealOrchestratorProps {
  waveContextId: string;          // ${dealerGameId}#h${hand}#r${round}
  dealerPosition: number;         // authoritative dealer seat position
  selfPlayerId: string;
  selfPosition?: number | null;
  activeSeats: ThreeFiveSevenSeatEntry[]; // active+not-sitting-out, any order
  cardsThisWave: number;          // 3 for r=1, 2 for r=2 & r=3
}

export function ThreeFiveSevenDealOrchestrator({
  waveContextId,
  dealerPosition,
  selfPlayerId,
  selfPosition = null,
  activeSeats,
  cardsThisWave,
}: ThreeFiveSevenDealOrchestratorProps) {
  const ct = useCardTransport();
  const deal = useDealRuntime();
  const dispatchedWaveRef = useRef<string | null>(null);
  const dealTimingHydrated = useDealTimingHydrated();
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  // Compute dealerIsSelf at render time (also used to mount a dealer-seat
  // anchor when CanonicalSeatCluster suppresses the self-viewer's seat).
  const dealerIsSelf =
    typeof dealerPosition === 'number' &&
    dealerPosition > 0 &&
    selfPosition === dealerPosition;
  const selfDealerFelt = useShellFeltFrameElement(dealerIsSelf);
  const selfDealerFeltIsSurface = !!selfDealerFelt?.hasAttribute('data-canonical-felt-surface');

  // Resolve the visual active-player hand region (destination for self
  // recipient intents) — re-queried on every render so wave/hand changes
  // pick up a freshly-mounted node.
  const [selfHandRegion, setSelfHandRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.querySelector('[data-357-active-hand-region]') as HTMLElement | null;
    setSelfHandRegion(el);
  }, [waveContextId, selfPlayerId]);

  useEffect(() => {
    if (!deal) return;
    if (dispatchedWaveRef.current === waveContextId) return;
    if (!dealTimingHydrated) return;
    if (cardsThisWave <= 0) return;
    if (!activeSeats.length) return;
    if (typeof dealerPosition !== 'number' || dealerPosition <= 0) return;
    if (dealerIsSelf && !selfDealerFeltIsSurface) return;

    // Build deal order:
    //   left-of-dealer first, then continue clockwise (LOWER position in
    //   our seatRing convention; see src/lib/canonicalShell/seatRing.ts —
    //   `nextClockwise = nearest LOWER occupied (wrap high)`).
    //   Dealer is included LAST (everyone plays in 357), never first.
    const sorted = [...activeSeats].sort((a, b) => a.position - b.position);
    // startIdx = index of largest position strictly less than dealer,
    // else wrap to the largest seat (last in ascending array).
    let startIdx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].position < dealerPosition) { startIdx = i; break; }
    }
    if (startIdx < 0) startIdx = sorted.length - 1;
    const dealOrder: ThreeFiveSevenSeatEntry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      dealOrder.push(sorted[(startIdx - i + sorted.length) % sorted.length]);
    }
    const recipientPositions = dealOrder.map(s => s.position);

    const emitTime = performance.now();
    const inspect = isCardTransportInspectMode();
    const timing = getDealTimingSnapshot();
    const intentTimingSource: 'GeometryLab' | 'inspectionMode' = inspect ? 'inspectionMode' : 'GeometryLab';
    const staggerMs  = inspect ? 800 : timing.launchSpacingMs;
    const durationMs = inspect ? 600 : timing.durationMs;
    const launchDelayFormula = inspect
      ? `idx * inspectionMode.launchSpacingMs(800); order=[${recipientPositions.join(',')}]`
      : `idx * DealTimingStore.launchSpacingMs(${timing.launchSpacingMs}) @v${timing.storeVersion}; order=[${recipientPositions.join(',')}]`;

    // When the local viewer is the dealer, EVERY flight (self + opponent)
    // launches from the canonical bottom-center felt deal origin —
    // a static [data-card-anchor="felt-deal-origin"] anchor inside the
    // canonical felt surface. Recipient determines destination only.
    const dealerOrigin: CardTransportIntent['from'] = dealerIsSelf
      ? { kind: 'feltDealOrigin' }
      : { kind: 'seat', position: dealerPosition };
    const intents: CardTransportIntent[] = [];

    for (let pass = 0; pass < cardsThisWave; pass++) {
      for (let off = 0; off < dealOrder.length; off++) {
        const r = dealOrder[off];
        const idx = intents.length;
        const isSelf = r.playerId === selfPlayerId;
        const cardId = `${waveContextId}#card-${idx}`;
        const launchDelayMs = idx * staggerMs;
        intents.push({
          id: cardId,
          cardId,
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
          handContextId: waveContextId,
          recipientPlayerId: r.playerId,
          cardBackColors: { color: cardBackColors.color, darkColor: cardBackColors.darkColor },
          dealerIsSelf,
          // visibleFace intentionally omitted — all deal flights are hidden.
        });
      }
    }

    dispatchedWaveRef.current = waveContextId;
    deal.beginWave(intents.length);
    ct.dispatchMany(intents);
  }, [
    deal, ct, waveContextId, dealerPosition, selfPlayerId,
    activeSeats, cardsThisWave, cardBackColors, dealTimingHydrated, dealerIsSelf, selfDealerFeltIsSurface,
  ]);

  // Committed active-hand card geometry, published by ActiveHandFan
  // once the phase-locked layout resolves. When present, the landing
  // anchor is sized to the exact final card rect so the transport
  // runtime reads `to.w`/`to.h` == final card size and the flight
  // lands directly into it (no post-settle snap). Fallback 1×1
  // preserves prior behavior if the fan has not yet published.
  const committedCardRect = useActiveHandCardRect('threeFiveSeven');
  const anchorWidth = committedCardRect?.cardWidthPx ?? 1;
  const anchorHeight = committedCardRect?.cardHeightPx ?? 1;

  return (
    <>
      {/* Canonical destination terminus for self-recipient intents —
          portaled into [data-357-active-hand-region] so resolved
          toRect lands on the visual active-player hand fan, NOT the
          identity row at the bottom of MobileGameTable. Sized to the
          committed final card rect so cards fly directly into their
          final width/height. */}
      {selfHandRegion ? createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '15%',
            width: anchorWidth,
            height: anchorHeight,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
          data-card-anchor={`hand-${selfPlayerId}`}
          data-canonical-shell-viewer-card-endpoint="357-self-hand"
          data-canonical-self-hand-anchor-position="top-of-pane"
          data-anchor-owner="ThreeFiveSevenDealOrchestrator.selfHandRegion"
          data-committed-card-w={anchorWidth}
          data-committed-card-h={anchorHeight}
        />
      , selfHandRegion) : null}
      {/* Dealer-seat origin anchor for the self-viewer-as-dealer case.
          Portaled onto the shell felt HOME slot. */}
      {dealerIsSelf && selfDealerFelt && selfDealerFeltIsSurface ? createPortal(
        <div
          aria-hidden="true"
          className={`absolute ${getCanonicalSlotPlacement(SLOT.HOME).className} pointer-events-none`}
          style={{ width: 40, height: 40 }}
          data-card-anchor={`seat-${dealerPosition}`}
          data-canonical-dealer-origin-self="357"
          data-canonical-shell-viewer-card-endpoint="357-dealer-origin"
          data-anchor-owner="ThreeFiveSevenDealOrchestrator.selfDealerFeltOrigin"
        />
      , selfDealerFelt) : null}
    </>
  );
}

// ─── Wave-key + size helpers ─────────────────────────────────────────

export const THREE_FIVE_SEVEN_GAME_TYPES = new Set(['3-5-7', '3-5-7-game', '357']);

export function is357GameType(gameType: string | null | undefined): boolean {
  return !!gameType && THREE_FIVE_SEVEN_GAME_TYPES.has(gameType);
}

/** Cards added per active player on this round/wave. */
export function cardsThisWaveFor357(round: number): number {
  if (round === 1) return 3;
  if (round === 2 || round === 3) return 2;
  return 0;
}

/** Cards each player already holds BEFORE this wave begins. */
export function prevWaveCountFor357(round: number): number {
  if (round === 1) return 0;
  if (round === 2) return 3;
  if (round === 3) return 5;
  return 0;
}

/** Total cards expected per active player AFTER this wave completes. */
export function totalAfterWaveFor357(round: number): number {
  return prevWaveCountFor357(round) + cardsThisWaveFor357(round);
}

// ─── Provider-aware helper components ────────────────────────────────

/**
 * Read the active DealRuntime and clip an opponent's visible card-back
 * count during DEALING. Outside DEALING (READY / GAMEPLAY / no runtime),
 * the legacy `defaultCount` is rendered verbatim.
 */
export function Use357OppCount({
  playerId,
  seat,
  baseline,
  defaultCount,
  expected,
  render,
}: {
  playerId: string;
  seat?: number | null;
  baseline: number;          // prevWaveCount (0/3/5)
  defaultCount: number;      // legacy cardCountToShow
  expected: number;          // total expected after this wave (3/5/7)
  render: (visibleCount: number) => ReactNode;
}) {
  const deal = useDealRuntime();
  const phase = deal?.phase ?? 'NO_RUNTIME';
  const settled = deal?.getSettledCountForPlayer(playerId) ?? 0;
  // CONTRACT: during DEALING / PRE_DEAL / READY render ONLY transport-
  // claimed cards (cumulative `settled`). Baseline / defaultCount must
  // NEVER mount DOM during a staged deal — they're for math only. Only
  // GAMEPLAY may fall through to authoritative. (READY is the transient
  // gap between waves; admitting authoritative there leaks future cards
  // instantly at r2/r3 start.)
  const claimOnlyVisible = !!deal && (deal.phase !== 'GAMEPLAY' || defaultCount > settled);
  const dealingVisible = Math.min(settled, expected);
  const visible = deal
    ? !claimOnlyVisible
      ? Math.max(defaultCount, dealingVisible)
      : dealingVisible
    : defaultCount;
  useEffect(() => {
    if (!deal?.handContextId) return;
    dealDbgUpsertOwnership(deal.handContextId, playerId, {
      role: 'opp',
      prevWaveCount: baseline,
      authoritativeCount: defaultCount,
      visibleCount: visible,
      dealPhase: phase,
      baselineApplied: visible >= baseline,
      renderGuardPassed: true,
    });
  }, [deal?.handContextId, playerId, baseline, defaultCount, visible, phase]);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const forensicsId = `357Opp:${playerId}`;
  useEffect(() => {
    const actualRenderedDomCount = typeof document !== 'undefined' && seat != null
      ? document.querySelectorAll(`[data-card-anchor="opp-stack-${seat}"] [data-playing-card-root], [data-card-anchor="opp-stack-${seat}"] [data-canonical-card-back]`).length
      : visible;
    recordThreeFiveSevenHandRender(forensicsId, {
      component: 'OPPONENT',
      componentName: `OPPONENT seat ${seat ?? '?'} card backs`,
      seat: seat ?? null,
      playerId,
      playerHandMounted: visible > 0,
      playerHandKey: seat != null ? `opp-stack-${seat}` : null,
      reactKey: `${deal?.handContextId ?? 'no-runtime'}:${playerId}`,
      renderCount: renderCountRef.current,
      cardsLength: defaultCount,
      effectiveCardsLength: visible,
      visibleCount: visible,
      actualRenderedDomCount,
      fanLayoutInitialized: visible > 0,
    });
  }, [forensicsId, deal?.handContextId, playerId, seat, defaultCount, visible]);
  useEffect(() => () => unregisterThreeFiveSevenHandRender(forensicsId), [forensicsId]);
  // ─── PER-CARD FORENSIC (opponent) ────────────────────────────────
  // For every authoritative card on this opponent, determine if it is
  // mounted in the DOM and — if not — WHY. Writes to
  // window.__357CardOwnershipTimeline so the murderer signs the confession.
  useEffect(() => {
    if (!deal?.handContextId || typeof document === 'undefined') return;
    const hand = deal.handContextId;
    const anchorSelector = seat != null ? `[data-card-anchor="opp-stack-${seat}"]` : null;
    const anchor = anchorSelector ? document.querySelector<HTMLElement>(anchorSelector) : null;
    const mounted = anchor
      ? Array.from(anchor.querySelectorAll<HTMLElement>('[data-playing-card-root], [data-canonical-card-back]'))
      : [];
    const flying = Array.from(
      document.querySelectorAll<HTMLElement>('[data-card-transport-flying="true"]'),
    ).filter((el) => el.getAttribute('data-recipient-player-id') === playerId);
    for (let i = 0; i < expected; i++) {
      const node = mounted[i] ?? null;
      const allowed = i < visible;
      let reason: CardHiddenReason = 'none';
      let domRect: { x: number; y: number; w: number; h: number } | null = null;
      let domMounted = !!node;
      if (node) {
        const r = node.getBoundingClientRect();
        domRect = { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
        const cs = window.getComputedStyle(node);
        if (cs.display === 'none') reason = 'display_none';
        else if (cs.visibility === 'hidden') reason = 'visibility_hidden';
        else if (parseFloat(cs.opacity) === 0) reason = 'opacity_zero';
        else if (r.width === 0 || r.height === 0) reason = 'fan_layout';
        else reason = 'none';
      } else if (!allowed) {
        reason = phase === 'DEALING'
          ? 'render_guard'
          : phase === 'PRE_DEAL'
            ? 'wave_transition'
            : 'render_guard';
      } else if (flying.length > 0) {
        reason = 'transport_inflight';
      } else {
        reason = 'unknown';
      }
      record357CardOwnership(`${hand}#opp#${playerId}#idx-${i}`, {
        handContextId: hand,
        role: 'opp',
        playerId,
        fanIndex: i,
        authoritativeVisible: true,
        domMounted,
        domRect,
        hiddenByReason: reason,
        dealPhase: phase,
        authoritativeCount: expected,
        visibleCount: visible,
        settledCount: settled,
      });
    }
  });
  // During DEALING: baseline + settled (this wave), clamped to expected.
  return <>{render(visible)}</>;
}


/**
 * Read the active DealRuntime and clip the self player's authoritative
 * hand to `baseline + settled(self)` during DEALING. Outside DEALING
 * (or with no runtime), passes the original `cards` through.
 */
export function Use357SelfHand<T>({
  currentPlayerId,
  cards,
  baseline,
  render,
}: {
  currentPlayerId: string;
  cards: T[];
  baseline: number;          // prevWaveCount
  render: (effectiveCards: T[], dealPhase: string, boundary: {
    claimedCardIds: string[];
    rawClaimedCardIds: string[];
    baseHandContextId: string;
    playerId: string;
    boundaryCardIdPrefix: string;
  }) => ReactNode;
}) {
  const deal = useDealRuntime();
  const phase = deal?.phase ?? 'NO_RUNTIME';
  const settled = deal?.getSettledCountForPlayer(currentPlayerId) ?? 0;
  const settledCardIds = deal?.getSettledCardIdsForPlayer(currentPlayerId) ?? [];
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // ── Self-hand cache (refined semantics) ───────────────────────────
  // cacheKey = baseHandContextId + playerId
  //   baseHandContextId = deal.handContextId = `${gameId}#h${epoch}`
  //   DOES NOT include round (r1/r2/r3). DealRuntime persists across
  //   rounds within a base hand and remounts only at hand boundary.
  //
  // Contract:
  //   - Within a single base hand: cache may refuse to shrink (sticky).
  //   - On baseHandContextId change: HARD RESET — destroy previous cache,
  //     start empty, rebuild exclusively from new ownership claims.
  //   - Transient authoritative empty (e.g. 7 → [] → 7): stick at 7.
  const baseHandContextId = deal?.handContextId ?? 'no-runtime';
  const cacheKey = `${baseHandContextId}::${currentPlayerId || 'no-player'}`;
  const cacheRef = useRef<{ cacheKey: string; cards: T[]; rendered: T[] }>({ cacheKey, cards: [], rendered: [] });
  if (cacheRef.current.cacheKey !== cacheKey) {
    // HARD RESET at hand boundary — never carry rendered cards across hands.
    cacheRef.current = { cacheKey, cards: [], rendered: [] };
  }
  if (cards.length >= cacheRef.current.cards.length) {
    cacheRef.current.cards = cards;
  }
  const sourceCards = cards.length >= cacheRef.current.cards.length ? cards : cacheRef.current.cards;

  // CONTRACT: while a DealRuntime exists, cache/render admission is
  // ownership-claim first. The old GAMEPLAY phase can briefly survive
  // into the next round before beginWave() flips DEALING; if authoritative
  // has already grown beyond `settled`, that is a pending wave and MUST
  // still be clipped to ownership claims. GAMEPLAY converges naturally
  // once settled === authoritative length.
  const isClaimOnlyRender = !!deal && (deal.phase !== 'GAMEPLAY' || sourceCards.length > settled);
  const allowed = isClaimOnlyRender ? settled : sourceCards.length;
  const resolvedCards: T[] = [];
  const unresolvedSelfCards: Array<{ intentId: string | null; cardId: string | null; claimedIndex: number }> = [];
  if (isClaimOnlyRender) {
    for (let i = 0; i < allowed; i++) {
      // Try authoritative first, then previously-rendered card for the
      // same index within the same base hand. NEVER render a cardback —
      // if face resolution fails, store unresolved claim and log
      // 357_SELF_CARD_FACE_UNRESOLVED so the next render retries from
      // authoritative once DB catches up.
      const card = sourceCards[i] ?? cacheRef.current.rendered[i];
      if (card) {
        resolvedCards.push(card);
      } else {
        unresolvedSelfCards.push({
          intentId: settledCardIds[i] ?? null,
          cardId: settledCardIds[i] ?? null,
          claimedIndex: i,
        });
      }
    }
  } else {
    resolvedCards.push(...sourceCards.slice(0, Math.min(allowed, sourceCards.length)));
  }
  // STICKINESS (within same base hand only): once a card index has been
  // rendered for this hand, never shrink below it. Guarded by cacheKey
  // equality — on hand boundary the cache is already reset above, so this
  // fallback cannot leak prior-hand cards.
  if (resolvedCards.length < cacheRef.current.rendered.length && cacheRef.current.cacheKey === cacheKey) {
    const stickyLimit = isClaimOnlyRender ? allowed : cacheRef.current.rendered.length;
    for (let i = resolvedCards.length; i < Math.min(cacheRef.current.rendered.length, stickyLimit); i++) {
      const prev = cacheRef.current.rendered[i];
      if (prev) resolvedCards.push(prev);
    }
  }
  // Update rendered cache. Within claim-only windows it is bounded by
  // ownership count so a previously-admitted future card is actively
  // evicted; outside claim-only it may converge to authoritative.
  if (isClaimOnlyRender || resolvedCards.length >= cacheRef.current.rendered.length) {
    cacheRef.current.rendered = resolvedCards.slice();
  }
  const effectiveCards = resolvedCards;
  const boundaryCardIdPrefix = `${baseHandContextId}#self#${currentPlayerId || 'no-player'}`;
  const boundaryClaimedCardIds = Array.from(
    { length: Math.max(0, settled) },
    (_, i) => `${boundaryCardIdPrefix}#idx-${i}`,
  );
  useEffect(() => {
    if (!deal?.handContextId || unresolvedSelfCards.length === 0) return;
    const authoritativeCardIds = sourceCards.map((c: any) => `${c?.rank ?? '?'}-${c?.suit ?? '?'}`);
    unresolvedSelfCards.forEach((missing) => {
      record357DiagnosticViolation('357_SELF_CARD_FACE_UNRESOLVED', {
        baseHandContextId,
        playerId: currentPlayerId,
        cardId: missing.cardId,
        claimedIndex: missing.claimedIndex,
        authoritativeCardIds,
        dealPhase: phase,
      }, {
        handContextId: deal.handContextId,
        phase,
        component: 'SELF',
        playerId: currentPlayerId,
      });
    });
  }, [deal?.handContextId, baseHandContextId, unresolvedSelfCards.length, currentPlayerId, phase, sourceCards]);
  useEffect(() => {
    if (!deal?.handContextId || !currentPlayerId) return;
    dealDbgUpsertOwnership(deal.handContextId, currentPlayerId, {
      role: 'self',
      prevWaveCount: baseline,
      authoritativeCount: cards.length,
      visibleCount: effectiveCards.length,
      dealPhase: phase,
      baselineApplied: effectiveCards.length >= Math.min(baseline, sourceCards.length),
      renderGuardPassed: true,
    });
  }, [deal?.handContextId, currentPlayerId, baseline, cards.length, effectiveCards.length, phase, sourceCards.length]);
  const forensicsId = `357Self:${currentPlayerId || 'unknown'}`;
  useEffect(() => {
    if (!currentPlayerId) return;
    const region = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-357-active-hand-region]')
      : null;
    const handAnchor = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-canonical-self-hand-anchor-position="top-of-pane"]')
      : null;
    const actualRenderedDomCount = region
      ? region.querySelectorAll('[data-playing-card-root], [data-card-id], [data-canonical-card-back]').length
      : 0;
    recordThreeFiveSevenHandRender(forensicsId, {
      component: 'SELF',
      componentName: 'SELF Use357SelfHand render layer',
      seat: null,
      playerId: currentPlayerId,
      playerHandMounted: !!region,
      playerHandKey: handAnchor?.getAttribute('data-card-anchor') ?? `hand-${currentPlayerId}`,
      reactKey: `${deal?.handContextId ?? 'no-runtime'}:${currentPlayerId}`,
      renderCount: renderCountRef.current,
      cardsLength: cards.length,
      effectiveCardsLength: effectiveCards.length,
      visibleCount: effectiveCards.length,
      actualRenderedDomCount,
      fanLayoutInitialized: actualRenderedDomCount > 0,
    });
  }, [forensicsId, deal?.handContextId, currentPlayerId, cards.length, effectiveCards.length]);
  useEffect(() => () => unregisterThreeFiveSevenHandRender(forensicsId), [forensicsId]);
  // ─── PER-CARD FORENSIC (self) ────────────────────────────────────
  // For every authoritative card in `cards`, determine if it is mounted
  // in the active-hand region and — if not — WHY. The murderer signs the
  // confession in window.__357CardOwnershipTimeline.
  useEffect(() => {
    if (!deal?.handContextId || !currentPlayerId || typeof document === 'undefined') return;
    const hand = deal.handContextId;
    const region = document.querySelector<HTMLElement>('[data-357-active-hand-region]');
    const mounted = region
      ? Array.from(region.querySelectorAll<HTMLElement>('[data-playing-card-root]'))
      : [];
    const flying = Array.from(
      document.querySelectorAll<HTMLElement>('[data-card-transport-flying="true"]'),
    ).filter((el) => el.getAttribute('data-recipient-player-id') === currentPlayerId);
    for (let i = 0; i < cards.length; i++) {
      const node = mounted[i] ?? null;
      const allowed = i < effectiveCards.length;
      let reason: CardHiddenReason = 'none';
      let domRect: { x: number; y: number; w: number; h: number } | null = null;
      const domMounted = !!node;
      if (node) {
        const r = node.getBoundingClientRect();
        domRect = { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
        const cs = window.getComputedStyle(node);
        if (cs.display === 'none') reason = 'display_none';
        else if (cs.visibility === 'hidden') reason = 'visibility_hidden';
        else if (parseFloat(cs.opacity) === 0) reason = 'opacity_zero';
        else if (r.width === 0 || r.height === 0) reason = 'fan_layout';
        else reason = 'none';
      } else if (!allowed) {
        reason = phase === 'DEALING'
          ? 'render_guard'
          : phase === 'PRE_DEAL'
            ? 'wave_transition'
            : 'render_guard';
      } else if (flying.length > 0) {
        reason = 'transport_inflight';
      } else {
        reason = 'unknown';
      }
      record357CardOwnership(`${hand}#self#${currentPlayerId}#idx-${i}`, {
        handContextId: hand,
        role: 'self',
        playerId: currentPlayerId,
        fanIndex: i,
        authoritativeVisible: true,
        domMounted,
        domRect,
        hiddenByReason: reason,
        dealPhase: phase,
        authoritativeCount: cards.length,
        visibleCount: effectiveCards.length,
        settledCount: settled,
      });
    }
  });
  return <>{render(effectiveCards, phase, {
    claimedCardIds: boundaryClaimedCardIds,
    rawClaimedCardIds: settledCardIds,
    baseHandContextId,
    playerId: currentPlayerId,
    boundaryCardIdPrefix,
  })}</>;
}


// ─── DealRuntime per-wave wrapper ────────────────────────────────────

/**
 * Wraps children with a DealRuntime keyed by `handContextId` (one runtime
 * per HAND, not per round/wave). The orchestrator inside dispatches
 * per-wave via `beginWave()` so ownership accumulates across waves
 * (3 → 5 → 7) without remount churn.
 */
export function ThreeFiveSevenDealRuntimeMaybe({
  handContextId,
  children,
}: {
  handContextId: string | null | undefined;
  children: ReactNode;
}) {
  if (!handContextId) return <>{children}</>;
  return (
    <DealRuntime key={handContextId} handContextId={handContextId} gameType="three-five-seven">
      {children}
    </DealRuntime>
  );
}
