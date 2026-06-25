import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Card as CardType, Rank, getBestFiveCardIndices } from "@/lib/cardUtils";
import { PlayingCard, getCardSize, CardSize } from "@/components/PlayingCard";
import { useCardRowLayout } from "@/lib/canonicalShell/useCardRowLayout";
import { usePlayGeometry } from "@/lib/canonicalShell/usePlayGeometry";
import {
  resolveShowdownRules,
  useThreeFiveSevenShowdownConfig,
  fanRotationDeg,
  type ResolvedRound,
  type ResolvedSecondary,
} from "@/lib/threeFiveSeven/showdownConfig";
import { supabase } from "@/integrations/supabase/client";
import {
  recordThreeFiveSevenHandRender,
  unregisterThreeFiveSevenHandRender,
} from "@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore";
import {
  record357HandLifecycle,
  record357FanLifecycle,
  record357CardOwnership,
  record357DiagnosticViolation,
} from "@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics";


let __playerHandForensicsSeq = 0;


interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
  expectedCardCount?: number;
  highlightedIndices?: number[];
  kickerIndices?: number[];
  hasHighlights?: boolean;
  gameType?: string | null;
  currentRound?: number;
  showSeparated?: boolean;
  tightOverlap?: boolean;
  unusedCardsBelow?: boolean;
  isRightSide?: boolean;
  isBottomPosition?: boolean;
  forceHiddenFaces?: boolean;
  /**
   * Wave 2A (3-5-7). Vertical budget already net of the contract-owned
   * action-strip reservation. Pass the *unscaled* reserve when the
   * caller wraps PlayerHand in a CSS `transform: scale` (divide the
   * scaled reserve by the wrapper scale).
   */
  availableHeightPx?: number;
  /**
   * Wave 2A (3-5-7). Optional explicit horizontal budget. When omitted,
   * the hand walks up to the canonical `[data-357-active-pane-content]`
   * ancestor and uses its layout `clientWidth` as the resolver budget.
   * That ancestor is a non-shrink-wrapping pane container, so it does
   * not collapse around the cards (the immediate parent does, which
   * caused a feedback loop where the cards' own size drove the budget).
   * `clientWidth` returns unscaled CSS layout pixels even when a
   * `transform: scale` wrapper sits between the pane and PlayerHand,
   * so the resolver sizes in the same coordinate space inline styles
   * render in (pre-transform). When a wrapper scale is supplied via
   * `wrapperScale`, the measured pane width is divided by it so the
   * post-transform footprint still fits the pane.
   */
  availableWidthPx?: number;
  /**
   * Wave 2A (3-5-7). CSS `transform: scale` applied by the caller
   * around PlayerHand. Used only to convert the measured pane width
   * (in post-transform pixels) into the unscaled budget the resolver
   * works in. Defaults to 1.
   */
  wrapperScale?: number;
  dealPhase?: string | null;
  claimedCardIds?: string[];
  baseHandContextId?: string | null;
  boundaryCardIdPrefix?: string | null;
  source?: string;
}



// Get wild rank based on round (3-5-7 game only)
const getWildRank = (round: number): string | null => {
  switch (round) {
    case 1: return '3';
    case 2: return '5';
    case 3: return '7';
    default: return null;
  }
};

export const PlayerHand = ({ 
  cards: incomingCards, 
  isHidden = false, 
  expectedCardCount,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
  gameType,
  currentRound = 0,
  showSeparated = false,
  tightOverlap = false,
  unusedCardsBelow = false,
  isRightSide = false,
  isBottomPosition = false,
  forceHiddenFaces = false,
  availableHeightPx,
  availableWidthPx,
  wrapperScale = 1,
  dealPhase = null,
  claimedCardIds,
  baseHandContextId = null,
  boundaryCardIdPrefix = null,
  source = 'PlayerHand.cards',
}: PlayerHandProps) => {
  const instanceIdRef = useRef(0);
  if (instanceIdRef.current === 0) {
    __playerHandForensicsSeq += 1;
    instanceIdRef.current = __playerHandForensicsSeq;
  }
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  // Determine wild rank for 3-5-7 games
  const is357Game = gameType === '3-5-7' || gameType === '3-5-7-game' || gameType === '357' || gameType === 'three-five-seven';
  // ─── 3-5-7 showdown geometry (v4) ────────────────────────────────────
  // v4 is OPPONENT-EXPOSED-SHOWDOWN ONLY. Self/active pane and all
  // non-opponent-showdown callers stay on the prior Tailwind/dyn
  // baseline below — they never consume `v4Resolved`.
  const showdownCfgV4 = useThreeFiveSevenShowdownConfig();
  // Responsive sizing requires the canonical felt vmin (min of felt
  // width/height in CSS pixels). usePlayGeometry returns 0 when outside
  // the shell provider; resolveCardPx clamps that to a sane fallback so
  // cards never disappear before measurement lands.
  const _phPlay = usePlayGeometry();
  const _feltVminPx = Math.min(_phPlay.width || 0, _phPlay.height || 0);
  const v4Resolved = resolveShowdownRules(showdownCfgV4, _feltVminPx);
  // OWNERSHIP BOUNDARY: v4 applies ONLY to opponent-exposed showdown.
  const isOpponentExposedShowdown = source !== 'MobileGameTable.activeSelfHand';
  const use357V4 = is357Game && isOpponentExposedShowdown;

  // Self-pane legacy geometry (preserves prior behavior verbatim for
  // active-player pane and other non-showdown callers).
  const SELF_LEGACY = {
    r1: { widthPx: 40, heightPx: 56, overlapPx: 4, fanStepDeg: 2 },
    r2: { widthPx: 64, heightPx: 96, overlapPx: 8, fanStepDeg: 2 },
    r3: { widthPx: 64, heightPx: 96, overlapPx: 8, fanStepDeg: 2 },
    irrelevant: {
      visible: true, dimmed: true, opacity: 0.6, scale: 0.75,
      positionMode: 'auto' as 'auto' | 'above' | 'below',
      interRowGapPx: 2, widthPx: 48, heightPx: 72, overlapPx: 6,
    },
  };

  // P2 NOTE: opponent-row placement has moved out of PlayerHand.
  // CanonicalSeatCluster now owns the showdown-row slot and applies
  // the felt-relative placement transform on its below-chip wrapper.
  // PlayerHand returns the card row content only — placement is a
  // shell concern, not a card-row concern.


  const isHolmGame = gameType === 'holm-game';

  // Boundary guard applies to any canonical-deal game during DEALING.
  const isCanonicalDealGuarded = is357Game || isHolmGame;
  const claimedSet = new Set(claimedCardIds ?? []);
  const cardBoundaryId = (card: CardType, index: number) => {
    const explicitId = (card as any).id ?? (card as any).cardId;
    if (explicitId != null && claimedSet.has(String(explicitId))) return String(explicitId);
    return `${boundaryCardIdPrefix ?? baseHandContextId ?? 'no-base'}#idx-${index}`;
  };
  const incomingIds = incomingCards.map(cardBoundaryId);
  const boundaryBlocked = isCanonicalDealGuarded && dealPhase === 'DEALING' && claimedCardIds
    ? incomingCards
        .map((card, index) => ({ card, index, id: cardBoundaryId(card, index) }))
        .filter(({ id }) => !claimedSet.has(id))
    : [];
  const cards = boundaryBlocked.length > 0
    ? incomingCards.filter((card, index) => claimedSet.has(cardBoundaryId(card, index)))
    : incomingCards;
  useEffect(() => {
    if (!isCanonicalDealGuarded || dealPhase !== 'DEALING' || boundaryBlocked.length === 0) return;

    const renderedIds = cards.map(cardBoundaryId);
    boundaryBlocked.forEach(({ id }) => {
      record357DiagnosticViolation('357_UNCLAIMED_CARD_BLOCKED_AT_PLAYERHAND_BOUNDARY', {
        cardId: id,
        source,
        dealPhase,
        claimedIds: claimedCardIds ?? [],
        incomingIds,
        baseHandContextId,
        renderedIds,
      }, {
        handContextId: baseHandContextId,
        phase: dealPhase,
        component: 'SELF',
        cardIds: incomingIds,
      });
    });
  }, [isCanonicalDealGuarded, dealPhase, boundaryBlocked.length, source, claimedCardIds, incomingIds, baseHandContextId, cards]);
  const wildRank = is357Game ? getWildRank(currentRound) : null;
  
  // For round 3 with 7 cards, separate into used and unused
  const isRound3With7Cards = is357Game && currentRound === 3 && cards.length === 7 && showSeparated && !isHidden;
  // For round 2 with 5 cards when unusedCardsBelow is requested
  const isRound2With5Cards = is357Game && currentRound === 2 && cards.length === 5 && unusedCardsBelow && !isHidden;
  // For round 3 with 7 cards when unusedCardsBelow is requested  
  const isRound3WithUnusedBelow = is357Game && currentRound === 3 && cards.length === 7 && unusedCardsBelow && !isHidden;
  const shouldSeparateCards = isRound3With7Cards || isRound2With5Cards || isRound3WithUnusedBelow;
  
  let usedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  let unusedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  
  if (shouldSeparateCards) {
    // For round 2: best 5 from 5 = all used (but we need to find unused from original sorting)
    // For round 3: best 5 from 7 = 5 used, 2 unused
    if (currentRound === 2 && cards.length === 5) {
      // In round 2, all 5 cards are used - no unused cards
      usedCards = cards.map((card, idx) => ({
        card,
        originalIndex: idx,
        isWild: wildRank !== null && card.rank === wildRank
      }));
      unusedCards = [];
    } else if (currentRound === 3 && cards.length === 7) {
      // Pass '7' as explicit wild rank for round 3 (important for correct 5-card subset evaluation)
      const { usedIndices, unusedIndices } = getBestFiveCardIndices(cards, true, '7' as Rank);
      
      usedCards = usedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
      
      unusedCards = unusedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
    }
    
    // Sort used cards: wild cards first, then by rank ascending
    usedCards.sort((a, b) => {
      if (a.isWild && !b.isWild) return -1;
      if (!a.isWild && b.isWild) return 1;
      return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
    });
    
    // Sort unused cards by rank ascending
    unusedCards.sort((a, b) => RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank]);
  }
  
  // Create sorted cards with original indices for highlighting (normal display)
  const cardsWithIndices = cards.map((card, index) => ({ 
    card, 
    originalIndex: index,
    isWild: wildRank !== null && card.rank === wildRank
  }));
  
  // Sort cards: wild cards first (descending by count), then by rank ascending
  const sortedCardsWithIndices = [...cardsWithIndices].sort((a, b) => {
    // Wild cards come first
    if (a.isWild && !b.isWild) return -1;
    if (!a.isWild && b.isWild) return 1;
    // Within same wild status, sort by rank ascending
    return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
  });
  
  const displayCardCount = cards.length > 0 ? cards.length : (expectedCardCount || 0);
  const cardSize = getCardSize(displayCardCount);

  // Round 1 (3-5-7) on mobile: cards were getting too wide when scaled.
  // Override the base w/h to be slightly narrower + taller to match a more natural playing-card ratio.
  const round1NarrowTallClass =
    is357Game && currentRound === 1 && displayCardCount === 3
      ? "w-10 h-16 sm:w-11 sm:h-[4.25rem]"
      : "";

  // Calculate overlap based on card count and tightOverlap flag
  const getOverlapClass = () => {
    if (tightOverlap) {
      // Tighter overlap for multi-player showdown
      if (displayCardCount >= 7) return '-ml-4 sm:-ml-4 first:ml-0';
      if (displayCardCount >= 5) return '-ml-3 sm:-ml-3 first:ml-0';
      return '-ml-2 first:ml-0';
    }
    if (displayCardCount >= 7) return '-ml-2 sm:-ml-2 first:ml-0';
    if (displayCardCount >= 5) return '-ml-2 sm:-ml-2 first:ml-0';
    return '-ml-1 first:ml-0';
  };

  const overlapClass = getOverlapClass();

  // ─── Wave 2A: 3-5-7 dynamic card row layout ───────────────────────────────
  // The active-player hand is a pane artifact, not a seat artifact. The
  // immediate parent is a shrink-wrapping transform/flex wrapper whose
  // width is *driven by the cards*, which created a feedback loop:
  //   ResizeObserver → smaller width → smaller cards → smaller wrapper.
  // We instead climb to the canonical `[data-357-active-pane-content]`
  // ancestor — a non-shrink-wrapping pane container — and divide its
  // post-transform width by the caller-supplied `wrapperScale` so the
  // resolver works in the same unscaled pixel space inline styles use.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [measuredPaneWidth, setMeasuredPaneWidth] = useState<number>(0);
  const [measuredParentWidth, setMeasuredParentWidth] = useState<number>(0);
  const forensicsId = `PlayerHand:${instanceIdRef.current}`;
  useLayoutEffect(() => {
    if (!is357Game) return;
    const el = measureRef.current;
    if (!el) return;
    const activeRegion = el.closest<HTMLElement>('[data-357-active-hand-region]');
    const seatCluster = el.closest<HTMLElement>('[data-canonical-seat-cluster]');
    const handAnchor = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-canonical-self-hand-anchor-position="top-of-pane"]')
      : null;
    const cardEls = Array.from(el.querySelectorAll<HTMLElement>('[data-playing-card-root], [data-canonical-card-back], [data-card-id]'));
    const actualRenderedDomCount = cardEls.length;
    const componentKind: 'SELF' | 'OPPONENT' | 'PLAYER_HAND' = activeRegion ? 'SELF' : seatCluster ? 'OPPONENT' : 'PLAYER_HAND';
    const playerId = seatCluster?.getAttribute('data-player-id') ?? null;
    const reactKey = `${gameType ?? 'unknown'}:r${currentRound}:inst${instanceIdRef.current}`;
    const handContextId = handAnchor?.getAttribute('data-card-anchor') ?? null;
    recordThreeFiveSevenHandRender(forensicsId, {
      component: componentKind,
      componentName: activeRegion ? 'SELF PlayerHand' : seatCluster ? 'OPPONENT PlayerHand' : 'PlayerHand',
      seat: seatCluster?.getAttribute('data-seat-position') ? Number(seatCluster.getAttribute('data-seat-position')) : null,
      playerId,
      playerHandMounted: true,
      playerHandKey: activeRegion ? (handAnchor?.getAttribute('data-card-anchor') ?? null) : null,
      reactKey,
      renderCount: renderCountRef.current,
      cardsLength: cards.length,
      effectiveCardsLength: cards.length,
      visibleCount: displayCardCount,
      actualRenderedDomCount,
      fanLayoutInitialized: actualRenderedDomCount > 0,
    });
    // Section A — HAND RENDER LIFECYCLE FORENSICS
    const cs = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
    const cardIds = cardEls.map((node) => node.getAttribute('data-card-id') || node.getAttribute('data-card-transport-card-id') || '');
    record357HandLifecycle({
      handContextId,
      phase: el.closest<HTMLElement>('[data-deal-phase]')?.getAttribute('data-deal-phase') ?? null,
      reactKey,
      mounted: true,
      visible: !!cs && cs.opacity !== '0' && cs.display !== 'none',
      opacity: cs?.opacity ?? null,
      display: cs?.display ?? null,
      cardCount: actualRenderedDomCount,
      cardIds,
      component: componentKind,
      playerId,
    });
    // Section C — FAN layout pass (this is the PlayerHand fan root render)
    record357FanLifecycle({
      event: 'layout-pass',
      reason: renderCountRef.current === 1 ? 'initialMount' : 'authoritativeUpdate',
      fanId: forensicsId,
      cardCount: actualRenderedDomCount,
      layoutPasses: renderCountRef.current,
      mountedAt: null,
      unmountedAt: null,
    });
  });
  useEffect(() => {
    if (!is357Game) return;
    record357FanLifecycle({
      event: 'mount',
      reason: 'initialMount',
      fanId: forensicsId,
      cardCount: 0,
      layoutPasses: 0,
      mountedAt: performance.now(),
      unmountedAt: null,
    });
    return () => {
      record357FanLifecycle({
        event: 'unmount',
        reason: 'componentUnmount',
        fanId: forensicsId,
        cardCount: 0,
        layoutPasses: renderCountRef.current,
        mountedAt: null,
        unmountedAt: performance.now(),
      });
    };
  }, [is357Game, forensicsId]);
  useEffect(() => () => unregisterThreeFiveSevenHandRender(forensicsId), [forensicsId]);
  // Section B — static card MOUNT detection via MutationObserver on the
  // fan root. Each freshly inserted [data-playing-card-root] is timestamped
  // and correlated against the card-ownership timeline. Provides ground
  // truth for `staticMountTime` independent of React render timing.
  useEffect(() => {
    if (!is357Game || typeof window === 'undefined') return;
    const el = measureRef.current;
    if (!el) return;
    const stampInsert = (node: HTMLElement) => {
      const cardId = node.getAttribute('data-card-id')
        || node.getAttribute('data-card-transport-card-id')
        || `${forensicsId}#staticPos-${Date.now()}`;
      record357CardOwnership(cardId, {
        staticMounted: true,
        staticVisible: true,
        staticMountTime: performance.now(),
      });
    };
    const stampRemove = (node: HTMLElement) => {
      const cardId = node.getAttribute('data-card-id')
        || node.getAttribute('data-card-transport-card-id');
      if (!cardId) return;
      record357CardOwnership(cardId, {
        staticMounted: false,
        staticVisible: false,
        staticUnmountTime: performance.now(),
      });
    };
    // Stamp anything already present.
    el.querySelectorAll<HTMLElement>('[data-playing-card-root]').forEach(stampInsert);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches('[data-playing-card-root]')) stampInsert(n);
          n.querySelectorAll?.<HTMLElement>('[data-playing-card-root]').forEach(stampInsert);
        });
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches('[data-playing-card-root]')) stampRemove(n);
          n.querySelectorAll?.<HTMLElement>('[data-playing-card-root]').forEach(stampRemove);
        });
      }
    });
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [is357Game, forensicsId, currentRound, displayCardCount]);
  useLayoutEffect(() => {
    if (!is357Game) return;
    const el = measureRef.current;
    if (!el) return;
    const pane = el.closest<HTMLElement>('[data-357-active-pane-content]');
    const parent = el.parentElement;
    const update = () => {
      if (pane) {
        const w = pane.clientWidth;
        if (Number.isFinite(w) && w > 0) {
          setMeasuredPaneWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        }
      } else if (parent) {
        // Fallback for non-active-pane sites (seated players, etc.) —
        // those use static wrappers that don't shrink-wrap pathologically.
        const w = parent.clientWidth;
        if (Number.isFinite(w) && w > 0) {
          setMeasuredParentWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (pane) ro.observe(pane);
    else if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [is357Game, currentRound, displayCardCount, isHidden]);

  const safeWrapperScale = Number.isFinite(wrapperScale) && wrapperScale > 0 ? wrapperScale : 1;

  const rawEffectiveWidth =
    is357Game
      ? (typeof availableWidthPx === 'number' && availableWidthPx > 0
          ? availableWidthPx
          : measuredPaneWidth > 0
            ? measuredPaneWidth / safeWrapperScale
            : measuredParentWidth)
      : 0;
  const effectiveAvailableWidth = Math.max(0, rawEffectiveWidth);
  const rawEffectiveHeight =
    is357Game && typeof availableHeightPx === 'number' && availableHeightPx > 0
      ? availableHeightPx
      : undefined;
  const effectiveAvailableHeight =
    typeof rawEffectiveHeight === 'number'
      ? Math.max(20, rawEffectiveHeight)
      : undefined;

  // dyn357 resolver: self/non-showdown only (clean-slate opponent path
  // does not use the dynamic resolver — v4 sizes are intrinsic).
  const dyn357 = useCardRowLayout({
    availableWidth: effectiveAvailableWidth,
    availableHeight: effectiveAvailableHeight,
    count: displayCardCount,
    aspect: 0.71,
    minCardWidth: 28,
    maxCardWidth: 80,
    maxOverlapRatio: 0.6,
  });
  const isR1ThreeCardShowdown =
    is357Game && currentRound === 1 && displayCardCount === 3;
  // Opponent v4 path disables dyn entirely.
  const useDynStyles =
    is357Game && Boolean(dyn357) && !isR1ThreeCardShowdown && !use357V4;
  const dyn357Style: CSSProperties | null =
    useDynStyles && dyn357
      ? { width: `${dyn357.cardWidth}px`, height: `${dyn357.cardHeight}px` }
      : null;
  const dyn357OverlapStyle: CSSProperties | null =
    useDynStyles && dyn357
      ? { marginLeft: `-${dyn357.overlapPx}px` }
      : null;
  const dynActive = !!dyn357Style;

  // R1 (3-card) static sizing. Opponent → v4. Self → legacy.
  const r1StaticSrc = is357Game && currentRound === 1 && displayCardCount === 3
    ? (use357V4
        ? { w: v4Resolved.r1.cardWidthPx, h: v4Resolved.r1.cardHeightPx, ovr: v4Resolved.r1.overlapPx }
        : { w: SELF_LEGACY.r1.widthPx, h: SELF_LEGACY.r1.heightPx, ovr: SELF_LEGACY.r1.overlapPx })
    : null;
  const static357R1Style: CSSProperties | null =
    is357Game && !dynActive && r1StaticSrc
      ? { width: `${r1StaticSrc.w}px`, height: `${r1StaticSrc.h}px` }
      : null;
  const static357R1OverlapPx: number | null =
    is357Game && !dynActive && r1StaticSrc ? r1StaticSrc.ovr : null;
  const effectiveOverlapClass = dynActive
    ? 'first:ml-0'
    : static357R1OverlapPx !== null
      ? 'first:ml-0'
      : overlapClass;
  const effectiveRound1Class = dynActive || static357R1Style ? '' : round1NarrowTallClass;
  const composeStyle = (base?: CSSProperties, includeOverlap = true, displayIndex?: number): CSSProperties | undefined => {
    if (dynActive) {
      return {
        ...(base || {}),
        ...(dyn357Style || {}),
        ...(includeOverlap ? (dyn357OverlapStyle || {}) : {}),
      };
    }
    if (static357R1Style && static357R1OverlapPx !== null) {
      const ml = displayIndex === 0 ? 0 : -static357R1OverlapPx;
      return {
        ...(base || {}),
        ...static357R1Style,
        ...(includeOverlap ? { marginLeft: `${ml}px` } : {}),
      };
    }
    return base;
  };




  // ─── Wave 2A measurement probe ────────────────────────────────────────────
  // Persists resolver output vs. actual rendered DOM size to debug_events.
  // Throttled per (round, count, parentWidth-rounded) signature per mount.
  const measureSentRef = useRef<Set<string>>(new Set());
  useLayoutEffect(() => {
    if (!is357Game || isHidden) return;
    const el = measureRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const firstCard = el.querySelector<HTMLElement>(':scope > *');
    if (!firstCard) return;
    const rowRect = el.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const parentClientWidth = parent.clientWidth;
    const parentRectWidth = parent.getBoundingClientRect().width;
    const activeHandRegion = el.closest<HTMLElement>('[data-357-active-hand-region]');
    const activePaneContent = el.closest<HTMLElement>('[data-357-active-pane-content]');
    const hudPane = el.closest<HTMLElement>('[data-hud-row="pane"]');
    const measureBox = (node: HTMLElement | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
      };
    };
    const wrapperScale =
      parentClientWidth > 0 ? parentRectWidth / parentClientWidth : null;
    const overlapRatio =
      dyn357 && dyn357.cardWidth > 0
        ? dyn357.overlapPx / dyn357.cardWidth
        : null;
    const sig = `${currentRound}|${displayCardCount}|${Math.round(parentClientWidth)}`;
    if (measureSentRef.current.has(sig)) return;
    measureSentRef.current.add(sig);
    const payload = {
      probe: '357-measure',
      round: currentRound,
      count: displayCardCount,
      availableWidth: effectiveAvailableWidth,
      parentClientWidth,
      parentRectWidth,
      wrapperScale,
      availableHeightPx: availableHeightPx ?? null,
      geometrySources: {
        measuredParent: measureBox(parent),
        activeHandRegion: measureBox(activeHandRegion),
        activePaneContent: measureBox(activePaneContent),
        hudPane: measureBox(hudPane),
      },
      resolver: dyn357
        ? {
            cardWidth: dyn357.cardWidth,
            cardHeight: dyn357.cardHeight,
            overlapPx: dyn357.overlapPx,
            overlapRatio,
            totalWidth: dyn357.totalWidth,
          }
        : null,
      rendered: {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        rowWidth: rowRect.width,
      },
      ts: new Date().toISOString(),
    };
    void supabase
      .from('debug_events')
      .insert({ event_type: '357-geometry-probe', payload })
      .then(() => {});
  });



  // Render card backs for hidden cards
  if (forceHiddenFaces || isHidden || (cards.length === 0 && expectedCardCount && expectedCardCount > 0)) {
    const count = forceHiddenFaces || isHidden ? displayCardCount : expectedCardCount!;
    
    
    // For 3-5-7 games with multiple cards, use fanned arc layout
    const useFannedArc = is357Game && count >= 3;
    
    // Calculate arc parameters for fanned layout
    const arcSpread = count >= 7 ? 45 : count >= 5 ? 35 : 25; // Total arc angle in degrees
    const startAngle = -arcSpread / 2;
    const angleStep = count > 1 ? arcSpread / (count - 1) : 0;
    
    return (
      <div className="flex justify-center relative" ref={is357Game ? measureRef : undefined} style={{ minHeight: '60px' }}>
        {Array.from({ length: count }, (_, index) => {
          // Calculate rotation and vertical offset for arc effect
          const rotation = useFannedArc ? startAngle + (index * angleStep) : (index * 2 - 2);
          const verticalOffset = useFannedArc 
            ? Math.abs(index - (count - 1) / 2) * 3 // Cards at edges are slightly higher
            : 0;
          
          return (
            <PlayingCard
              key={index}
              isHidden
              size={cardSize}
              className={`${useFannedArc ? (dynActive ? 'first:ml-0' : '-ml-4 first:ml-0') : effectiveOverlapClass} ${effectiveRound1Class} animate-fade-in`}
              style={composeStyle({
                transform: `rotate(${rotation}deg) translateY(${verticalOffset}px)`,
                animationDelay: `${index * 150}ms`,
                animationFillMode: 'backwards',
                transformOrigin: 'bottom center'
              }, useFannedArc) /* fanned arc: keep dyn overlap; otherwise use overlapClass */ }
            />
          );
        })}
      </div>
    );
  }

  // 3-5-7 showdown display with unused cards in separate row (on outer edge).
  // Opponent path uses v4 geometry; self path uses legacy constants.
  if ((isRound2With5Cards || isRound3WithUnusedBelow) && unusedCardsBelow) {
    const usedCardSize: CardSize = 'lg';
    const unusedCardSize: CardSize = 'sm';

    // Resolve main-row and secondary-group sizing.
    // - Opponent R3 uses v4.r3 + v4.r3.secondary.
    // - Opponent R2 uses v4.r2; the secondary block is suppressed for
    //   R2 (no irrelevant cards in R2 by game rules).
    // - Self/legacy uses SELF_LEGACY constants verbatim.
    let mainW: number, mainH: number, mainOverlapPx: number, mainFanDeg: number, mainCount: number;
    let secVisibility: 'hidden' | 'dimmed' | 'face-down' = 'dimmed';
    let secPlacement: 'above' | 'below' | 'left' | 'right' = 'below';
    let secOffsetPrimaryPct = 0;
    let secOffsetCrossPct = 0;
    let secScale = 1;
    let secOpacity = 1;
    let secGrayscale = 0;
    let secW: number, secH: number, secOverlapPx: number;
    let interRowGap: number;

    if (use357V4) {
      const round = isRound3WithUnusedBelow ? v4Resolved.r3 : v4Resolved.r2;
      mainW = round.cardWidthPx;
      mainH = round.cardHeightPx;
      mainOverlapPx = round.overlapPx;
      mainFanDeg = round.fanDegrees;
      mainCount = usedCards.length;
      const sec: ResolvedSecondary | null = isRound3WithUnusedBelow
        ? v4Resolved.r3.secondary
        : null;
      if (sec) {
        secVisibility = sec.visibility;
        secPlacement = sec.placement;
        secOffsetPrimaryPct = sec.offsetPrimaryPct;
        secOffsetCrossPct = sec.offsetCrossPct;
        secScale = sec.scale;
        secOpacity = sec.opacity;
        secGrayscale = sec.grayscale;
        secW = sec.cardWidthPx;
        secH = sec.cardHeightPx;
        secOverlapPx = sec.overlapPx;
      } else {
        secW = 0; secH = 0; secOverlapPx = 0;
        secVisibility = 'hidden';
      }
      interRowGap = 0; // gap is now expressed via secondary.offsetPrimaryPct
    } else {
      const m = isRound3WithUnusedBelow ? SELF_LEGACY.r3 : SELF_LEGACY.r2;
      mainW = m.widthPx;
      mainH = m.heightPx;
      mainOverlapPx = m.overlapPx;
      mainFanDeg = 0;
      mainCount = usedCards.length;
      const sl = SELF_LEGACY.irrelevant;
      secVisibility = sl.dimmed ? 'dimmed' : 'face-down';
      secPlacement = (sl.positionMode === 'above' || (sl.positionMode === 'auto' && isBottomPosition)) ? 'above' : 'below';
      secOffsetPrimaryPct = 0;
      secOffsetCrossPct = 0;
      secScale = sl.scale;
      secOpacity = sl.opacity;
      secGrayscale = 0;
      secW = sl.widthPx;
      secH = sl.heightPx;
      secOverlapPx = sl.overlapPx;
      interRowGap = sl.interRowGapPx;
    }

    // For v4, derive a px gap from offsetPrimaryPct relative to main-row
    // extent along the placement axis. For above/below it's % of main-row
    // height; for left/right it's % of main-row width-extent.
    const mainRowExtentPx =
      mainCount <= 0
        ? 0
        : mainCount === 1
          ? mainW
          : mainW + (mainCount - 1) * Math.max(0, mainW - mainOverlapPx);
    const isVerticalSecondary = secPlacement === 'above' || secPlacement === 'below';
    const secAxisBasis = isVerticalSecondary ? mainH : mainRowExtentPx;
    const secPrimaryGapPx = use357V4
      ? (secOffsetPrimaryPct / 100) * secAxisBasis
      : interRowGap;
    const secCrossDriftPx = use357V4
      ? (secOffsetCrossPct / 100) * (isVerticalSecondary ? mainRowExtentPx : mainH)
      : 0;

    const showSecondary =
      secVisibility !== 'hidden' && unusedCards.length > 0;

    const unusedCardsElement = showSecondary && (
      <div
        className={`flex items-center ${isRightSide ? 'self-end' : 'self-start'}`}
        style={
          use357V4
            ? { transform: `translate(${secCrossDriftPx}px, 0)` }
            : undefined
        }
      >
        {unusedCards.map(({ card, originalIndex }, displayIndex) => (
          <PlayingCard
            key={`unused-${card.rank}-${card.suit}-${originalIndex}`}
            card={card}
            size={unusedCardSize}
            isDimmed={secVisibility === 'dimmed'}
            // NOTE: face-down VISIBILITY only restyles; game-rule-owned
            // reveal/face state is enforced upstream (we only render
            // cards already classified as the R3 irrelevant secondary
            // group).
            isHidden={secVisibility === 'face-down'}
            isWild={false}
            style={{
              width: `${secW}px`,
              height: `${secH}px`,
              marginLeft: displayIndex === 0 ? 0 : `-${secOverlapPx}px`,
              opacity: secOpacity,
              transform: `scale(${secScale})`,
              filter: secGrayscale > 0 ? `grayscale(${secGrayscale})` : undefined,
            }}
          />
        ))}
      </div>
    );

    const n = mainCount;
    const mainFanDir = use357V4
      ? (isRound3WithUnusedBelow ? v4Resolved.r3.fanDirection : v4Resolved.r2.fanDirection)
      : 'outward';
    const mainFanSign = mainFanDir === 'inward' ? -1 : 1;
    // ── Real fan/bow ─────────────────────────────────────────────
    // Each card retains its marginLeft overlap. To turn pure rotation
    // into a true bow, we move each card's transform-origin off-center
    // along the row's perpendicular axis. Rotating around that off-
    // center pivot translates the card along an arc of radius equal
    // to the pivot distance, so non-zero fanDegrees produces BOTH a
    // per-card tilt AND a per-card positional offset. Per-card
    // displacement: dx ≈ R·sin(θ_i), dy ≈ R·(1−cos θ_i).
    //
    //   outward (bow AWAY from felt center): pivot BELOW row → arc
    //                                         curves UP → outer cards
    //                                         rise away from felt.
    //   inward  (bow TOWARD felt center)   : pivot ABOVE row → arc
    //                                         curves DOWN → outer cards
    //                                         drop toward felt.
    //
    // Bow is vertical (perpendicular to the horizontal row), so the
    // up/down semantics are preserved for every seat side; horizontal
    // mirroring is owned by the placement attachment system, not here.
    const PIVOT_K = 1.8;
    const mainUseArcFan = use357V4 && mainFanDeg !== 0;
    const mainPivotPx = mainH * PIVOT_K;
    const mainTransformOrigin = mainUseArcFan
      ? (mainFanDir === 'inward'
          ? `50% ${-mainPivotPx}px`
          : `50% ${mainH + mainPivotPx}px`)
      : undefined;
    const usedCardsElement = (
      <div className="flex items-end">
        {usedCards.map(({ card, originalIndex, isWild }, displayIndex) => {
          const isHighlighted = highlightedIndices.includes(originalIndex);
          const isKicker = kickerIndices.includes(originalIndex);
          const isDimmed = hasHighlights && !isHighlighted && !isKicker;
          const rotationDeg = fanRotationDeg(mainFanDeg, displayIndex, n) * mainFanSign;
          return (
            <PlayingCard
              key={`used-${card.rank}-${card.suit}-${originalIndex}`}
              card={card}
              size={usedCardSize}
              isHighlighted={isHighlighted}
              isKicker={isKicker}
              isDimmed={isDimmed}
              isWild={isWild}
              style={{
                width: `${mainW}px`,
                height: `${mainH}px`,
                marginLeft: displayIndex === 0 ? 0 : `-${mainOverlapPx}px`,
                transform: `rotate(${rotationDeg}deg)`,
                transformOrigin: mainTransformOrigin,
              }}
            />
          );
        })}
      </div>
    );


    // Placement layout. above/below = column; left/right = row.
    const stackVertical = secPlacement === 'above' || secPlacement === 'below';
    const secondaryAbove = secPlacement === 'above' || secPlacement === 'left';
    return (
      <div
        className={stackVertical ? 'flex flex-col' : 'flex flex-row items-center'}
        style={{ gap: `${secPrimaryGapPx}px` }}
        ref={is357Game ? measureRef : undefined}
      >
        {secondaryAbove ? (
          <>
            {unusedCardsElement}
            {usedCardsElement}
          </>
        ) : (
          <>
            {usedCardsElement}
            {unusedCardsElement}
          </>
        )}
      </div>
    );
  }





  // Special round 3 display with unused cards dimmed but all together.
  // This branch fires only when `!unusedCardsBelow`. Opponent showdown
  // always passes unusedCardsBelow=true, so this is a self-only path
  // and uses legacy constants exclusively.
  if (isRound3With7Cards && !unusedCardsBelow) {
    const allCardsOrdered = [...unusedCards, ...usedCards];
    const fanStep = SELF_LEGACY.r3.fanStepDeg;
    const n = allCardsOrdered.length;
    const irrOpacity = SELF_LEGACY.irrelevant.opacity;

    return (
      <div
        className="flex items-end"
        ref={is357Game ? measureRef : undefined}
      >
        {allCardsOrdered.map(({ card, originalIndex, isWild }, displayIndex) => {
          const isUnused = displayIndex < unusedCards.length;
          const isHighlighted = !isUnused && highlightedIndices.includes(originalIndex);
          const isKicker = !isUnused && kickerIndices.includes(originalIndex);
          const isDimmed = isUnused || (hasHighlights && !isHighlighted && !isKicker);
          const rotationDeg = fanStep * (displayIndex - (n - 1) / 2);
          return (
            <PlayingCard
              key={`r3-${card.rank}-${card.suit}-${originalIndex}`}
              card={card}
              size={cardSize}
              isHighlighted={isHighlighted}
              isKicker={isKicker}
              isDimmed={isDimmed}
              isWild={!isUnused && isWild}
              faceFillPx={dynActive && !isUnused ? dyn357!.cardWidth : undefined}
              className={`${effectiveOverlapClass} ${effectiveRound1Class}`}
              style={composeStyle({
                transform: `rotate(${rotationDeg}deg)`,
                opacity: isUnused ? irrOpacity : 1,
              }, true, displayIndex)}
            />
          );
        })}
      </div>
    );
  }

  // Default branch (also the 3-5-7 R1 showdown path).
  // For 3-5-7 R1 opponent: v4.r1.fanDegrees (TOTAL spread).
  // For self R1 and all non-357 callers: legacy 2°/card step.
  const isR1Three = is357Game && currentRound === 1 && displayCardCount === 3;
  const useV4FanR1 = isR1Three && use357V4;
  const defaultFanStep = isR1Three && !use357V4 ? SELF_LEGACY.r1.fanStepDeg : 2;
  const v4R1TotalFanDeg = useV4FanR1 ? v4Resolved.r1.fanDegrees : 0;
  const v4R1FanDir = useV4FanR1 ? v4Resolved.r1.fanDirection : 'outward';
  const v4R1FanSign = v4R1FanDir === 'inward' ? -1 : 1;
  // Real-fan pivot for R1 opponent showdown. Pivot distance scales with
  // resolved R1 card height. See main-row comment above for full math.
  const v4R1UseArcFan = useV4FanR1 && v4R1TotalFanDeg !== 0;
  const v4R1CardH = useV4FanR1 ? v4Resolved.r1.cardHeightPx : 0;
  const v4R1PivotPx = v4R1CardH * 1.8;
  const v4R1TransformOrigin = v4R1UseArcFan
    ? (v4R1FanDir === 'inward'
        ? `50% ${-v4R1PivotPx}px`
        : `50% ${v4R1CardH + v4R1PivotPx}px`)
    : undefined;
  const r1MarkerActive =
    is357Game && currentRound === 1 && displayCardCount === 3 && !forceHiddenFaces;
  return (
    <div
      className="flex"
      ref={is357Game ? measureRef : undefined}
      
      {...(r1MarkerActive ? { 'data-357-r1-row': 'true' } : {})}
    >


      {sortedCardsWithIndices.map(({ card, originalIndex, isWild }, displayIndex) => {
        const isHighlighted = highlightedIndices.includes(originalIndex);
        const isKicker = kickerIndices.includes(originalIndex);
        const isDimmed = hasHighlights && !isHighlighted && !isKicker;
        const n = sortedCardsWithIndices.length;
        const rotationDeg = useV4FanR1
          ? fanRotationDeg(v4R1TotalFanDeg, displayIndex, n) * v4R1FanSign
          : defaultFanStep * (displayIndex - (n - 1) / 2);


        const cardEl = (
          <PlayingCard
            key={`${card.rank}-${card.suit}-${originalIndex}`}
            card={card}
            isHidden={forceHiddenFaces}
            size={cardSize}
            isHighlighted={isHighlighted}
            isKicker={isKicker}
            isDimmed={isDimmed}
            isWild={isWild}
            faceFillPx={dynActive ? dyn357!.cardWidth : undefined}
            className={`${effectiveOverlapClass} ${effectiveRound1Class}`}
            style={composeStyle({
              transform: `rotate(${rotationDeg}deg)`,
              ...(v4R1TransformOrigin ? { transformOrigin: v4R1TransformOrigin } : null),
            }, true, displayIndex)}
          />
        );
        if (r1MarkerActive && displayIndex < 3) {
          return (
            <span
              key={`r1m-${card.rank}-${card.suit}-${originalIndex}`}
              data-357-r1-card={String(displayIndex)}
              style={{ display: 'contents' }}
            >
              {cardEl}
            </span>
          );
        }
        return cardEl;
      })}
    </div>
  );
};

