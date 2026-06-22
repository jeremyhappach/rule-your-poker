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

    // Dealer seat is the canonical visual source for ALL flights —
    // including when the viewer is the dealer. We mount an invisible
    // `[data-card-anchor="seat-${dealerPosition}"]` anchor below when
    // dealerIsSelf so resolveCardEndpoint always finds it.
    const dealerOrigin: CardTransportIntent['from'] = { kind: 'seat', position: dealerPosition };
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

  return (
    <>
      {/* Canonical destination terminus for self-recipient intents —
          portaled into [data-357-active-hand-region] so resolved
          toRect lands on the visual active-player hand fan, NOT the
          identity row at the bottom of MobileGameTable. */}
      {selfHandRegion ? createPortal(
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
          data-canonical-shell-viewer-card-endpoint="357-self-hand"
          data-canonical-self-hand-anchor-position="top-of-pane"
          data-anchor-owner="ThreeFiveSevenDealOrchestrator.selfHandRegion"
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
  // settled is CUMULATIVE across waves within the hand — visibility is
  // simply min(settled, expected) during DEALING, floored by baseline
  // (prevWaveCount) in PRE_DEAL so previously-settled cards never vanish.
  const dealingVisible = Math.min(Math.max(baseline, settled), expected);
  const visible = deal
    ? deal.phase === 'DEALING'
      ? dealingVisible
      : deal.phase === 'PRE_DEAL'
        ? Math.max(baseline, Math.min(settled, expected))
        : Math.max(baseline, defaultCount, dealingVisible)
    : Math.max(baseline, defaultCount);
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
  render: (effectiveCards: T[]) => ReactNode;
}) {
  const deal = useDealRuntime();
  const phase = deal?.phase ?? 'NO_RUNTIME';
  const settled = deal?.getSettledCountForPlayer(currentPlayerId) ?? 0;
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Cache the longest authoritative cards array seen for this hand. If
  // the upstream DB transiently empties `cards` between waves (e.g. r1→r2
  // round flip clearing then re-populating), we fall back to the cached
  // array so previously-settled cards never disappear — even for one
  // frame. The cache resets on hand boundary via DealRuntime remount.
  const handKey = deal?.handContextId ?? 'no-runtime';
  const cacheRef = useRef<{ handKey: string; cards: T[] }>({ handKey, cards: [] });
  if (cacheRef.current.handKey !== handKey) {
    cacheRef.current = { handKey, cards: [] };
  }
  if (cards.length >= cacheRef.current.cards.length) {
    cacheRef.current = { handKey, cards };
  }
  const sourceCards = cards.length >= cacheRef.current.cards.length ? cards : cacheRef.current.cards;

  // Cumulative settled: visible = min(max(baseline, settled), sourceCards.length).
  const allowed = deal
    ? deal.phase === 'DEALING'
      ? Math.min(Math.max(baseline, settled), sourceCards.length)
      : deal.phase === 'PRE_DEAL'
        ? Math.min(Math.max(baseline, settled), sourceCards.length)
        : sourceCards.length
    : sourceCards.length;
  const effectiveCards = sourceCards.slice(0, Math.min(allowed, sourceCards.length));
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
  return <>{render(effectiveCards)}</>;
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
    <DealRuntime key={handContextId} handContextId={handContextId}>
      {children}
    </DealRuntime>
  );
}
